import fs from 'fs/promises';
import path from 'path';
import { createCellManifestTemplate, validateCellName, validateSectorName } from '../utils/cell-utils';
import { CellManifest } from '../core/cell';

// Cell Scaffolding - Tools to convert existing code into Cells
export class CellGenerator {
  private baseDir: string;

  constructor(baseDir: string = './cells') {
    this.baseDir = baseDir;
  }

  // Generate a new Cell from template
  async generateCell(options: CellGenerationOptions): Promise<string> {
    const { sector, name, version = '1.0.0', actions = [], description } = options;

    // Validate inputs
    if (!validateSectorName(sector)) {
      throw new Error(`Invalid sector name: ${sector}. Must be lowercase alphanumeric with underscores.`);
    }

    if (!validateCellName(name)) {
      throw new Error(`Invalid cell name: ${name}. Must be alphanumeric with underscores and dashes.`);
    }

    const cellDir = path.join(this.baseDir, sector, name);
    const cellId = `${sector}/${name}`;

    // Create directory structure
    await this.createCellDirectories(cellDir);

    // Generate manifest
    const manifest = this.createCellManifest(sector, name, version, actions, description);
    await this.writeManifest(cellDir, manifest);

    // Generate source files
    await this.generateClientComponent(cellDir, name, actions);
    await this.generateServerClass(cellDir, name, actions);
    await this.generateSchemaFile(cellDir, actions);
    await this.generateBuildScript(cellDir, cellId);

    console.log(`[CellGenerator] Generated Cell ${cellId} at ${cellDir}`);
    return cellDir;
  }

  // Convert existing component/class into Cell structure
  async convertToCell(options: CellConversionOptions): Promise<string> {
    const { sector, name, sourcePath, componentType, extractActions = true } = options;

    const cellDir = path.join(this.baseDir, sector, name);
    const cellId = `${sector}/${name}`;

    // Read source file
    const sourceCode = await fs.readFile(sourcePath, 'utf-8');

    // Analyze source code to extract actions
    const actions = extractActions ? this.extractActionsFromCode(sourceCode, componentType) : [];

    // Create Cell directory structure
    await this.createCellDirectories(cellDir);

    // Generate Cell files based on source
    const manifest = this.createCellManifest(sector, name, '1.0.0', actions);
    await this.writeManifest(cellDir, manifest);

    // Convert source code to Cell format
    await this.convertSourceToCell(cellDir, sourcePath, componentType, actions);
    await this.generateSchemaFile(cellDir, actions);
    await this.generateBuildScript(cellDir, cellId);

    console.log(`[CellGenerator] Converted ${sourcePath} to Cell ${cellId}`);
    return cellDir;
  }

  // Build Cell artifacts for deployment
  async buildCell(cellDir: string): Promise<CellBuildResult> {
    const manifestPath = path.join(cellDir, 'cell.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as CellManifest;

    const buildDir = path.join(cellDir, 'dist');
    await fs.mkdir(buildDir, { recursive: true });

    const artifacts: CellBuildResult = {
      cellId: manifest.id,
      version: manifest.version,
      artifacts: {}
    };

    // Build client component
    const clientPath = path.join(cellDir, 'src', 'client.tsx');
    if (await this.fileExists(clientPath)) {
      const clientBundle = await this.buildClientBundle(clientPath, buildDir);
      artifacts.artifacts.clientBundle = clientBundle;
    }

    // Build server module
    const serverPath = path.join(cellDir, 'src', 'server.ts');
    if (await this.fileExists(serverPath)) {
      const serverBundle = await this.buildServerBundle(serverPath, buildDir);
      artifacts.artifacts.serverBundle = serverBundle;
    }

    // Copy schema
    const schemaPath = path.join(cellDir, 'src', 'schema.ts');
    if (await this.fileExists(schemaPath)) {
      const schemaJson = await this.buildSchemaJson(schemaPath, buildDir);
      artifacts.artifacts.schema = schemaJson;
    }

    console.log(`[CellGenerator] Built Cell ${manifest.id} v${manifest.version}`);
    return artifacts;
  }

  // Scan project for Cell conversion candidates
  async scanForCellCandidates(projectDir: string): Promise<CellCandidate[]> {
    const candidates: CellCandidate[] = [];

    // Scan for React components
    const reactFiles = await this.findFiles(projectDir, /\.(tsx|jsx)$/);
    for (const file of reactFiles) {
      const code = await fs.readFile(file, 'utf-8');
      if (this.isReactComponent(code)) {
        candidates.push({
          path: file,
          type: 'react-component',
          suggestedName: this.extractComponentName(code),
          suggestedSector: this.suggestSector(file),
          complexity: this.estimateComplexity(code)
        });
      }
    }

    // Scan for service classes
    const tsFiles = await this.findFiles(projectDir, /\.ts$/);
    for (const file of tsFiles) {
      const code = await fs.readFile(file, 'utf-8');
      if (this.isServiceClass(code)) {
        candidates.push({
          path: file,
          type: 'service-class',
          suggestedName: this.extractClassName(code),
          suggestedSector: this.suggestSector(file),
          complexity: this.estimateComplexity(code)
        });
      }
    }

    return candidates;
  }

  // Private helper methods

  private async createCellDirectories(cellDir: string): Promise<void> {
    const directories = [
      cellDir,
      path.join(cellDir, 'src'),
      path.join(cellDir, 'dist'),
      path.join(cellDir, 'tests')
    ];

    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  private createCellManifest(
    sector: string, 
    name: string, 
    version: string, 
    actions: string[], 
    description?: string
  ): CellManifest {
    const template = createCellManifestTemplate(sector, name, version);
    
    return {
      ...template,
      description: description || template.description || `${name} Cell in ${sector} sector`,
      actions,
      schemaUrl: `./dist/schema.json`
    } as CellManifest;
  }

  private async writeManifest(cellDir: string, manifest: CellManifest): Promise<void> {
    const manifestPath = path.join(cellDir, 'cell.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  private async generateClientComponent(cellDir: string, name: string, actions: string[]): Promise<void> {
    const componentTemplate = `'use client';

import React, { useState } from 'react';

interface ${name}Props {
  // Define your props here
  [key: string]: any;
}

export default function ${name}Cell(props: ${name}Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Cell action handlers
${actions.map(action => `  const handle${action.charAt(0).toUpperCase() + action.slice(1)} = async () => {
    setLoading(true);
    try {
      // Call server action via Cell Bus
      const response = await fetch(\`/api/cells/${name.toLowerCase()}/\${action}\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(props)
      });
      const result = await response.json();
      setResult(result);
    } catch (error) {
      console.error('Cell action error:', error);
    } finally {
      setLoading(false);
    }
  };`).join('\n\n')}

  return (
    <div className="webwaka-cell border rounded-lg p-4 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">${name} Cell</h3>
        <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
          {/* Cell ID will be set by manifest */}
        </div>
      </div>
      
      <div className="space-y-3">
        {/* Add your UI here */}
        ${actions.map(action => `<button
          onClick={handle${action.charAt(0).toUpperCase() + action.slice(1)}}
          disabled={loading}
          className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          ${action.charAt(0).toUpperCase() + action.slice(1)}
        </button>`).join('\n        ')}
        
        {result && (
          <div className="mt-4 p-3 bg-gray-50 rounded border">
            <pre className="text-sm">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}`;

    const clientPath = path.join(cellDir, 'src', 'client.tsx');
    await fs.writeFile(clientPath, componentTemplate);
  }

  private async generateServerClass(cellDir: string, name: string, actions: string[]): Promise<void> {
    const serverTemplate = `// ${name} Cell - Server Actions

export interface ${name}Input {
  // Define your input types here
  [key: string]: any;
}

export interface ${name}Output {
  // Define your output types here
  [key: string]: any;
}

export class ${name}Cell {
${actions.map(action => `  // ${action} action
  async ${action}(input: ${name}Input): Promise<${name}Output> {
    // Implement your ${action} logic here
    console.log(\`[${name}Cell] Executing ${action}\`, input);
    
    // Placeholder implementation
    return {
      action: '${action}',
      input,
      timestamp: new Date().toISOString(),
      result: 'success'
    };
  }`).join('\n\n')}
}

// Export singleton instance
export const ${name.toLowerCase()}Cell = new ${name}Cell();`;

    const serverPath = path.join(cellDir, 'src', 'server.ts');
    await fs.writeFile(serverPath, serverTemplate);
  }

  private async generateSchemaFile(cellDir: string, actions: string[]): Promise<void> {
    const schemaTemplate = `import { z } from 'zod';

// Input/Output schemas for Cell actions
export const ${actions.length > 0 ? actions[0] : 'action'}InputSchema = z.object({
  // Define your input schema here
});

export const ${actions.length > 0 ? actions[0] : 'action'}OutputSchema = z.object({
  // Define your output schema here
});

// Export all schemas
export const cellSchemas = {
${actions.map(action => `  ${action}: {
    input: ${action}InputSchema,
    output: ${action}OutputSchema
  }`).join(',\n')}
};`;

    const schemaPath = path.join(cellDir, 'src', 'schema.ts');
    await fs.writeFile(schemaPath, schemaTemplate);
  }

  private async generateBuildScript(cellDir: string, cellId: string): Promise<void> {
    const buildScript = `#!/bin/bash
# Build script for ${cellId} Cell

echo "Building ${cellId} Cell..."

# Create dist directory
mkdir -p dist

# Build client bundle (placeholder - would use actual bundler)
echo "Building client bundle..."
cp src/client.tsx dist/client.mjs

# Build server bundle (placeholder - would use actual bundler)
echo "Building server bundle..."
cp src/server.ts dist/server.mjs

# Generate schema JSON
echo "Generating schema..."
echo '{"schemas": "placeholder"}' > dist/schema.json

echo "Build complete for ${cellId}"`;

    const buildPath = path.join(cellDir, 'build.sh');
    await fs.writeFile(buildPath, buildScript);
    
    // Make script executable (on Unix systems)
    try {
      await fs.chmod(buildPath, '755');
    } catch {
      // Ignore on Windows
    }
  }

  private extractActionsFromCode(code: string, componentType: string): string[] {
    const actions: string[] = [];

    if (componentType === 'react-component') {
      // Extract functions that look like actions
      const functionMatches = code.match(/(?:const|function)\s+(\w+)\s*[=\(]/g);
      if (functionMatches) {
        for (const match of functionMatches) {
          const name = match.match(/(\w+)/)?.[1];
          if (name && !['useState', 'useEffect', 'useCallback'].includes(name)) {
            actions.push(name);
          }
        }
      }
    } else if (componentType === 'service-class') {
      // Extract methods from class
      const methodMatches = code.match(/(?:async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/g);
      if (methodMatches) {
        for (const match of methodMatches) {
          const name = match.match(/(\w+)/)?.[1];
          if (name && name !== 'constructor') {
            actions.push(name);
          }
        }
      }
    }

    return actions.slice(0, 10); // Limit to 10 actions max
  }

  private async convertSourceToCell(
    cellDir: string, 
    sourcePath: string, 
    componentType: string, 
    actions: string[]
  ): Promise<void> {
    const sourceCode = await fs.readFile(sourcePath, 'utf-8');

    if (componentType === 'react-component') {
      // Convert React component to Cell format
      const convertedClient = this.convertReactComponentToCell(sourceCode, actions);
      await fs.writeFile(path.join(cellDir, 'src', 'client.tsx'), convertedClient);
    }

    // Generate corresponding server class
    const fileName = path.basename(sourcePath, path.extname(sourcePath));
    await this.generateServerClass(cellDir, fileName, actions);
  }

  private convertReactComponentToCell(code: string, actions: string[]): string {
    // Basic conversion - in production this would be more sophisticated
    let converted = code;

    // Add Cell wrapper class
    converted = converted.replace(
      /export default function (\w+)/,
      `export default function $1Cell`
    );

    // Add Cell container div
    converted = converted.replace(
      /return\s*\(/,
      'return (\n    <div className="webwaka-cell border rounded-lg p-4 bg-white shadow-sm">'
    );

    // Close Cell container
    converted = converted.replace(/\);(\s*)$/, '    </div>\n  );$1');

    return converted;
  }

  private async findFiles(dir: string, pattern: RegExp): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          files.push(...await this.findFiles(fullPath, pattern));
        } else if (entry.isFile() && pattern.test(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore directories we can't read
    }
    
    return files;
  }

  private isReactComponent(code: string): boolean {
    return /export\s+default\s+function\s+\w+|export\s+function\s+\w+|const\s+\w+\s*=.*=>/m.test(code) &&
           /import.*React|from\s+['"]react['"]/.test(code);
  }

  private isServiceClass(code: string): boolean {
    return /export\s+class\s+\w+|class\s+\w+/.test(code) &&
           /async\s+\w+\s*\(|public\s+async|private\s+async/.test(code);
  }

  private extractComponentName(code: string): string {
    const match = code.match(/export\s+default\s+function\s+(\w+)|export\s+function\s+(\w+)|const\s+(\w+)\s*=/);
    return match?.[1] || match?.[2] || match?.[3] || 'UnknownComponent';
  }

  private extractClassName(code: string): string {
    const match = code.match(/export\s+class\s+(\w+)|class\s+(\w+)/);
    return match?.[1] || match?.[2] || 'UnknownClass';
  }

  private suggestSector(filePath: string): string {
    const pathParts = filePath.split(path.sep);
    
    // Look for sector-like directory names
    const sectorKeywords = ['components', 'services', 'utils', 'lib', 'features', 'modules'];
    for (const part of pathParts) {
      if (sectorKeywords.includes(part.toLowerCase())) {
        return part.toLowerCase();
      }
    }
    
    // Default sector based on file type
    if (filePath.includes('component')) return 'ui';
    if (filePath.includes('service')) return 'services';
    if (filePath.includes('util')) return 'utils';
    
    return 'general';
  }

  private estimateComplexity(code: string): 'low' | 'medium' | 'high' {
    const lines = code.split('\n').length;
    const functionCount = (code.match(/function|=>/g) || []).length;
    const importCount = (code.match(/import/g) || []).length;
    
    const score = lines * 0.1 + functionCount * 2 + importCount * 1;
    
    if (score < 20) return 'low';
    if (score < 50) return 'medium';
    return 'high';
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async buildClientBundle(clientPath: string, buildDir: string): Promise<Buffer> {
    // Placeholder - in production would use actual bundler like Webpack/Vite
    const content = await fs.readFile(clientPath);
    const bundlePath = path.join(buildDir, 'client.mjs');
    await fs.writeFile(bundlePath, content);
    return content;
  }

  private async buildServerBundle(serverPath: string, buildDir: string): Promise<Buffer> {
    // Placeholder - in production would use actual bundler
    const content = await fs.readFile(serverPath);
    const bundlePath = path.join(buildDir, 'server.mjs');
    await fs.writeFile(bundlePath, content);
    return content;
  }

  private async buildSchemaJson(schemaPath: string, buildDir: string): Promise<object> {
    // Placeholder - in production would compile TypeScript schemas to JSON
    const schema = {
      version: '1.0.0',
      schemas: 'placeholder',
      compiledFrom: schemaPath
    };
    
    const schemaJsonPath = path.join(buildDir, 'schema.json');
    await fs.writeFile(schemaJsonPath, JSON.stringify(schema, null, 2));
    return schema;
  }
}

// Types for Cell generation
export interface CellGenerationOptions {
  sector: string;
  name: string;
  version?: string;
  actions?: string[];
  description?: string;
}

export interface CellConversionOptions {
  sector: string;
  name: string;
  sourcePath: string;
  componentType: 'react-component' | 'service-class' | 'function' | 'other';
  extractActions?: boolean;
}

export interface CellBuildResult {
  cellId: string;
  version: string;
  artifacts: {
    clientBundle?: Buffer;
    serverBundle?: Buffer;
    schema?: object;
  };
}

export interface CellCandidate {
  path: string;
  type: 'react-component' | 'service-class' | 'function' | 'other';
  suggestedName: string;
  suggestedSector: string;
  complexity: 'low' | 'medium' | 'high';
}

// Singleton generator instance
export const cellGenerator = new CellGenerator();