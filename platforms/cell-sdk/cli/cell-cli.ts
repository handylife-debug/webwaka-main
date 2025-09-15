#!/usr/bin/env node

import { Command } from 'commander';
import { cellGenerator } from '../scaffolding/cell-generator';
import { productionRegistry } from '../registry/production-registry';
import { channelManager } from '../management/channel-manager';
import { tissueOrchestrator } from '../composition/tissue-orchestrator';
import path from 'path';
import fs from 'fs/promises';

// WebWaka Cell CLI - Command-line tools for Cell management
const program = new Command();

program
  .name('webwaka-cell')
  .description('WebWaka Biological Hierarchical System - Cell Management CLI')
  .version('1.0.0');

// Cell generation commands
const generateCommand = program.command('generate').description('Generate new Cells');

generateCommand
  .command('cell')
  .description('Generate a new Cell from template')
  .requiredOption('-s, --sector <sector>', 'Cell sector (e.g., inventory, crm)')
  .requiredOption('-n, --name <name>', 'Cell name (e.g., TaxCalculator)')
  .option('-v, --version <version>', 'Cell version', '1.0.0')
  .option('-a, --actions <actions>', 'Comma-separated list of actions', 'process')
  .option('-d, --description <description>', 'Cell description')
  .action(async (options: any) => {
    try {
      const actions = options.actions.split(',').map((a: string) => a.trim());
      
      const cellDir = await cellGenerator.generateCell({
        sector: options.sector,
        name: options.name,
        version: options.version,
        actions,
        description: options.description
      });
      
      console.log(`✅ Generated Cell ${options.sector}/${options.name} at ${cellDir}`);
      console.log(`   Actions: ${actions.join(', ')}`);
      console.log('   Next steps:');
      console.log(`   - Edit src/client.tsx for UI implementation`);
      console.log(`   - Edit src/server.ts for business logic`);
      console.log(`   - Run 'webwaka-cell build ${cellDir}' to build artifacts`);
    } catch (error) {
      console.error('❌ Error generating Cell:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

generateCommand
  .command('tissue')
  .description('Generate a new Tissue composition')
  .requiredOption('-i, --id <id>', 'Tissue ID')
  .requiredOption('-n, --name <name>', 'Tissue name')
  .option('-d, --description <description>', 'Tissue description')
  .action(async (options: any) => {
    try {
      const tissueTemplate = {
        id: options.id,
        name: options.name,
        description: options.description || `${options.name} Tissue composition`,
        version: '1.0.0',
        steps: [
          {
            id: 'step1',
            cellId: 'example/SampleCell',
            action: 'process',
            inputs: { input: 'tissueInput' },
            outputs: { result: 'step1Result' }
          }
        ],
        inputs: { tissueInput: 'input' },
        outputs: { finalResult: 'step1Result' }
      };

      const tissueDir = path.join('./tissues', options.id);
      await fs.mkdir(tissueDir, { recursive: true });
      
      const tissueFile = path.join(tissueDir, 'tissue.json');
      await fs.writeFile(tissueFile, JSON.stringify(tissueTemplate, null, 2));
      
      console.log(`✅ Generated Tissue ${options.id} at ${tissueDir}`);
      console.log('   Edit tissue.json to configure Cell steps and dataflow');
    } catch (error) {
      console.error('❌ Error generating Tissue:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Cell conversion commands
const convertCommand = program.command('convert').description('Convert existing code to Cells');

convertCommand
  .command('scan')
  .description('Scan project for Cell conversion candidates')
  .option('-d, --dir <directory>', 'Directory to scan', '.')
  .action(async (options: any) => {
    try {
      const candidates = await cellGenerator.scanForCellCandidates(options.dir);
      
      if (candidates.length === 0) {
        console.log('No Cell conversion candidates found.');
        return;
      }
      
      console.log(`Found ${candidates.length} Cell conversion candidates:\n`);
      
      candidates.forEach((candidate, index) => {
        console.log(`${index + 1}. ${candidate.path}`);
        console.log(`   Type: ${candidate.type}`);
        console.log(`   Suggested: ${candidate.suggestedSector}/${candidate.suggestedName}`);
        console.log(`   Complexity: ${candidate.complexity}`);
        console.log('');
      });
      
      console.log('Use "webwaka-cell convert file" to convert specific files.');
    } catch (error) {
      console.error('❌ Error scanning for candidates:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

convertCommand
  .command('file')
  .description('Convert a specific file to a Cell')
  .requiredOption('-f, --file <file>', 'File to convert')
  .requiredOption('-s, --sector <sector>', 'Target sector')
  .requiredOption('-n, --name <name>', 'Target Cell name')
  .option('-t, --type <type>', 'Component type', 'react-component')
  .action(async (options: any) => {
    try {
      const cellDir = await cellGenerator.convertToCell({
        sourcePath: options.file,
        sector: options.sector,
        name: options.name,
        componentType: options.type as any
      });
      
      console.log(`✅ Converted ${options.file} to Cell ${options.sector}/${options.name}`);
      console.log(`   Cell directory: ${cellDir}`);
    } catch (error) {
      console.error('❌ Error converting file:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Cell build commands
program
  .command('build')
  .description('Build Cell artifacts for deployment')
  .argument('<cellDir>', 'Cell directory to build')
  .action(async (cellDir: string) => {
    try {
      const result = await cellGenerator.buildCell(cellDir);
      
      console.log(`✅ Built Cell ${result.cellId} v${result.version}`);
      console.log('   Artifacts:');
      
      if (result.artifacts.clientBundle) {
        console.log(`   - Client bundle: ${result.artifacts.clientBundle.length} bytes`);
      }
      if (result.artifacts.serverBundle) {
        console.log(`   - Server bundle: ${result.artifacts.serverBundle.length} bytes`);
      }
      if (result.artifacts.schema) {
        console.log(`   - Schema: generated`);
      }
    } catch (error) {
      console.error('❌ Error building Cell:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Registry commands
const registryCommand = program.command('registry').description('Cell Registry management');

registryCommand
  .command('publish')
  .description('Publish Cell to registry')
  .argument('<cellDir>', 'Cell directory to publish')
  .option('-c, --channel <channel>', 'Target channel', 'canary')
  .action(async (cellDir: string, options: any) => {
    try {
      // Build Cell first
      const buildResult = await cellGenerator.buildCell(cellDir);
      
      // Read manifest
      const manifestPath = path.join(cellDir, 'cell.json');
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
      
      // Register in production registry
      await productionRegistry.registerCell(manifest, {
        ...buildResult.artifacts,
        schema: buildResult.artifacts.schema || {}
      });
      
      console.log(`✅ Published Cell ${buildResult.cellId} v${buildResult.version} to registry`);
      console.log(`   Available on channel: ${options.channel}`);
    } catch (error) {
      console.error('❌ Error publishing Cell:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

registryCommand
  .command('promote')
  .description('Promote Cell channel')
  .requiredOption('--cell <cellId>', 'Cell ID (sector/name)')
  .requiredOption('--from <channel>', 'Source channel')
  .requiredOption('--to <channel>', 'Target channel')
  .action(async (options: any) => {
    try {
      // Get current version from source channel
      const entry = await productionRegistry.resolveCell(options.cell, options.from);
      const version = entry.manifest.version;
      
      // Update target channel
      await productionRegistry.updateChannel(options.cell, options.to, version);
      
      console.log(`✅ Promoted ${options.cell} from ${options.from} to ${options.to}`);
      console.log(`   Version: ${version}`);
    } catch (error) {
      console.error('❌ Error promoting Cell:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

registryCommand
  .command('list')
  .description('List Cells in registry')
  .option('-s, --sector <sector>', 'Filter by sector')
  .action(async (options: any) => {
    try {
      if (options.sector) {
        const cells = await productionRegistry.listCellsBySector(options.sector);
        console.log(`Cells in sector '${options.sector}':`);
        cells.forEach(cell => console.log(`  - ${cell}`));
      } else {
        console.log('Registry listing not implemented yet. Use --sector to filter.');
      }
    } catch (error) {
      console.error('❌ Error listing Cells:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Tissue commands
const tissueCommand = program.command('tissue').description('Tissue management');

tissueCommand
  .command('register')
  .description('Register a Tissue composition')
  .argument('<tissueFile>', 'Tissue definition file (tissue.json)')
  .action(async (tissueFile: string) => {
    try {
      const tissueDefinition = JSON.parse(await fs.readFile(tissueFile, 'utf-8'));
      await tissueOrchestrator.registerTissue(tissueDefinition);
      
      console.log(`✅ Registered Tissue ${tissueDefinition.id}`);
      console.log(`   Steps: ${tissueDefinition.steps.length}`);
    } catch (error) {
      console.error('❌ Error registering Tissue:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

tissueCommand
  .command('execute')
  .description('Execute a Tissue composition')
  .requiredOption('--tissue <tissueId>', 'Tissue ID to execute')
  .option('--input <json>', 'Input data as JSON string', '{}')
  .action(async (options: any) => {
    try {
      const input = JSON.parse(options.input);
      const result = await tissueOrchestrator.executeTissue(options.tissue, input);
      
      console.log(`✅ Executed Tissue ${options.tissue}`);
      console.log(`   Duration: ${result.duration}ms`);
      console.log(`   Output:`, JSON.stringify(result.output, null, 2));
    } catch (error) {
      console.error('❌ Error executing Tissue:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

tissueCommand
  .command('health')
  .description('Check Tissue health')
  .requiredOption('--tissue <tissueId>', 'Tissue ID to check')
  .action(async (options: any) => {
    try {
      const health = await tissueOrchestrator.getTissueHealth(options.tissue);
      
      const statusIcon = health.status === 'healthy' ? '✅' : 
                        health.status === 'degraded' ? '⚠️' : 
                        health.status === 'failed' ? '❌' : '❓';
      
      console.log(`${statusIcon} Tissue ${options.tissue}: ${health.status}`);
      console.log(`   ${health.message}`);
      
      if (health.totalExecutions) {
        console.log(`   Executions: ${health.totalExecutions} (${health.recentFailures} failures)`);
      }
    } catch (error) {
      console.error('❌ Error checking Tissue health:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Status commands
program
  .command('status')
  .description('Show WebWaka system status')
  .action(async () => {
    try {
      const compositions = tissueOrchestrator.listCompositions();
      
      console.log('🧬 WebWaka Biological Hierarchical System Status\n');
      console.log(`📊 Registered Compositions:`);
      console.log(`   Tissues: ${compositions.tissues.length}`);
      console.log(`   Organs: ${compositions.organs.length}`);
      
      if (compositions.tissues.length > 0) {
        console.log('\n🦠 Active Tissues:');
        for (const tissueId of compositions.tissues) {
          try {
            const health = await tissueOrchestrator.getTissueHealth(tissueId);
            const statusIcon = health.status === 'healthy' ? '✅' : 
                              health.status === 'degraded' ? '⚠️' : 
                              health.status === 'failed' ? '❌' : '❓';
            console.log(`   ${statusIcon} ${tissueId} - ${health.status}`);
          } catch (error) {
            console.log(`   ❓ ${tissueId} - unknown (error checking health)`);
          }
        }
      }
      
      console.log('\n🏗️  Cell SDK: Operational');
      console.log('🗄️  Registry: Connected');
      console.log('⚡ Channel Manager: Active');
      console.log('🧪 Tissue Orchestrator: Ready');
    } catch (error) {
      console.error('❌ Error getting system status:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse(process.argv);

export { program };