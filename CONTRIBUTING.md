# Contributing to WebWaka

Welcome to WebWaka! This guide ensures your contributions align with our **Reuse-First Mandate** and WebWaka Biological Cell System architecture.

## 🔐 Reuse-First Mandate (ADR-0001)

**BEFORE writing ANY new code, you MUST:**

### 1. 📋 New Module Reuse Checklist

- [ ] **Searched existing cells** for similar functionality
- [ ] **Checked capability registry** for overlapping features  
- [ ] **Identified reusable components** in `platforms/lib` and `platforms/cells/ui`
- [ ] **Listed dependencies** this module will consume
- [ ] **Justified new module** if existing options insufficient

### 2. 🔍 Reuse Survey (Required in ALL PRs)

Every PR MUST include this section:

```markdown
## Reuse Survey
- **Existing modules reused**: [List specific cells/modules consumed]
- **Dependencies added**: [List new dependencies in cell.json]
- **Duplication check**: [Confirm no code >15 lines duplicated]
- **Capability overlap**: [Explain any overlap with existing cells]
- **Reuse justification**: [Why existing modules were insufficient, if applicable]
```

### 3. 🏗️ Cell Architecture Requirements

#### Cell Manifest (`cell.json`)
Every cell MUST include:
```json
{
  "cellId": "unique-cell-identifier",
  "name": "Descriptive Cell Name",
  "version": "1.0.0",
  "description": "Clear description of cell functionality",
  "provides": ["capability1", "capability2"],
  "dependsOn": ["prerequisite-cell-1", "prerequisite-cell-2"],
  "capabilityTags": ["unique-tag-1", "unique-tag-2"],
  "cellType": "ui|service|integration|composite",
  "layer": "ui|business|data|infrastructure"
}
```

#### Import Boundaries (Enforced by ESLint)
- **UI cells** → can import from `platforms/cells/ui` only
- **Business cells** → can import from `platforms/lib` and lower layers
- **Data cells** → can import from `platforms/lib/database` only
- **NO cross-layer violations** allowed

## 🛠️ Development Workflow

### Setting Up
1. **Clone and install dependencies**
```bash
git clone <repo>
cd webwaka
npm install
```

2. **Run reuse validation**
```bash
npm run lint:boundaries  # Check import boundaries
npm run check:duplicates # Detect code duplication
npm run validate:cells   # Verify cell manifests
```

### Creating New Functionality

#### Option 1: Extend Existing Cell (PREFERRED)
```bash
# 1. Identify the existing cell to enhance
npm run cell:list | grep "relevant-capability"

# 2. Add new features to existing cell
# Edit: platforms/cells/[category]/[ExistingCell]/src/server.ts
# Add new methods/features without duplicating existing logic

# 3. Update cell.json with new capabilities
# Add to "provides": ["new-capability"]
```

#### Option 2: Create New Cell (ONLY if necessary)
```bash
# 1. Run reuse audit first
npm run audit:reuse --capability="new-functionality"

# 2. Generate cell with dependency mapping
npm run cell:generate
# Generator will prompt for:
# - Dependencies to reuse
# - Justification for new cell
# - Capability tags (must be unique)

# 3. Implement with maximum reuse
# Import existing cells instead of duplicating logic
```

### Code Quality Gates

#### Pre-commit (Automated)
- **ESLint boundary rules**: Prevents cross-layer imports
- **jscpd duplication**: Blocks >15 line duplicates
- **Cell validator**: Ensures proper cell.json structure

#### Pre-push (Automated)  
- **Dependency cruiser**: Validates layer compliance
- **Capability overlap**: Checks for duplicate capabilities
- **Test coverage**: Ensures adequate testing

#### CI/CD (Automated)
- **Reuse compliance**: Full repository duplication analysis
- **Cell registry**: Updates central capability index
- **Integration tests**: Validates cell interactions

## 📝 Code Standards

### File Structure
```
platforms/
├── lib/                    # Shared utilities (reusable)
├── cells/
│   ├── ui/                # UI primitives (reusable)
│   ├── [category]/        # Domain cells
│   │   └── [CellName]/
│   │       ├── cell.json  # Manifest (required)
│   │       ├── src/
│   │       │   ├── server.ts  # Server logic
│   │       │   └── client.tsx # Client UI
│   │       └── tests/
└── components/            # Page-level components
```

### Naming Conventions
- **Cells**: PascalCase ending in "Cell" (e.g., `PaymentProcessingCell`)
- **Files**: kebab-case (e.g., `payment-processing.ts`)
- **Functions**: camelCase with clear purpose (e.g., `processPaymentTransaction`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `NIGERIAN_VAT_RATE`)

### Import Guidelines
```typescript
// ✅ CORRECT: Reuse existing cells
import { CustomerProfileCell } from '../customer/CustomerProfile';
import { formatCurrency } from '@/lib/currency';

// ❌ WRONG: Creating duplicate utility
function formatMoney(amount) { /* duplicate logic */ }

// ✅ CORRECT: Extend existing functionality  
const enhancedCustomer = {
  ...CustomerProfileCell,
  newFeature: () => { /* additional logic */ }
};
```

## 🧪 Testing Requirements

### Unit Tests
- **All new functions** must have unit tests
- **Reuse test utilities** from `platforms/lib/test-utils`
- **Mock external dependencies** properly

### Integration Tests
- **Cell interactions** must be tested
- **Dependency resolution** validation required
- **End-to-end workflows** for new features

### Test Structure
```typescript
// ✅ Reuse existing test patterns
import { createTestData } from '@/lib/test-utils';
import { CustomerProfileCell } from '../CustomerProfile';

describe('PaymentProcessing', () => {
  const testCustomer = createTestData.customer(); // Reuse test utilities
  
  it('should reuse customer validation', async () => {
    // Test reused functionality
    const result = await CustomerProfileCell.validate(testCustomer);
    expect(result.isValid).toBe(true);
  });
});
```

## 🚨 Common Violations

### ❌ Code Duplication
```typescript
// DON'T duplicate validation logic
function validateEmail(email) {
  // Custom validation logic
}

// ✅ DO reuse existing validators
import { validateEmail } from '@/lib/validators';
```

### ❌ Cross-Layer Imports
```typescript
// DON'T import business logic in UI
import { processPayment } from '../../../business/payment';

// ✅ DO use proper layer separation
import { PaymentProcessingCell } from '../PaymentProcessing';
```

### ❌ Missing Dependencies
```json
// DON'T forget to declare dependencies
{
  "provides": ["payment-processing"],
  // Missing: "dependsOn": ["customer-profile", "sales-engine"]
}
```

## 🛡️ Enforcement

### Automatic Blocks
- **Pre-commit**: Code duplication >15 lines
- **CI**: Missing reuse survey in PR
- **Merge**: Capability overlap without justification

### Manual Review
- **Code review**: Architectural compliance
- **PR approval**: Reuse mandate adherence
- **Deployment**: Final reuse validation

## 📚 Resources

- [ADR-0001: Reuse-First Mandate](./docs/ADR-0001-Reuse-First-Mandate.md)
- [WebWaka Cell Architecture Guide](./docs/cell-architecture.md)
- [Capability Registry](./docs/capability-registry.md)
- [Reuse Patterns & Examples](./docs/reuse-patterns.md)

## 🤝 Getting Help

- **Slack**: #webwaka-development
- **Documentation**: `/platforms/docs`
- **Code review**: Tag @webwaka-architects
- **Architecture questions**: Consult ADR documents

Remember: **Reuse First, Create Last** - this is the WebWaka way! 🚀