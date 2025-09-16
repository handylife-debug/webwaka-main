# ADR-0001: Reuse-First Mandate

**Status:** Accepted  
**Date:** September 16, 2025  
**Authors:** WebWaka Architecture Team  

## Context

WebWaka follows the "WebWaka Biological Cell System" where cells are designed to be **100% reusable functional units**. To maintain architectural integrity, prevent code duplication, and ensure scalable modularity, we must enforce a strict reuse-first development approach.

## Decision

**ALL development in WebWaka MUST follow the Reuse-First Mandate:**

### Core Principles

1. **Existing Code First**: Before writing any new functionality, developers MUST search for and reuse existing implementations
2. **Module Consumption**: Existing modules/cells MUST be used instead of creating new duplicates
3. **Extend, Don't Duplicate**: Enhance existing cells rather than creating parallel implementations
4. **Dependency Declaration**: All cell dependencies MUST be explicitly declared in `cell.json`
5. **Zero Tolerance**: Code duplication >15 lines or overlapping capabilities are BLOCKED

### Enforcement Mechanisms

#### 1. Development Gates
- **Pre-commit**: ESLint boundary rules + jscpd duplication detection
- **Pre-push**: Dependency-cruiser validation + cell capability overlap check
- **CI/CD**: Automated reuse validation with strict thresholds

#### 2. Mandatory Workflows
- **New Module Checklist**: Required for all new cell/module creation
- **Reuse Survey**: Required section in all PRs
- **Capability Audit**: Automated check for overlapping cell capabilities

#### 3. Architectural Controls
- **Cell Manifests**: Mandatory `provides`, `dependsOn`, and `capabilityTags`
- **Import Boundaries**: Enforced layer restrictions (lib → cells → features)
- **Central Registry**: Capability uniqueness validation

## Implementation Strategy

### Phase 1: Policy & Governance ✅
- [x] ADR-0001 (this document)
- [x] CONTRIBUTING.md with Reuse Checklist
- [x] CODEOWNERS for shared libraries
- [x] PR template with Reuse Survey

### Phase 2: Developer Tooling
- [ ] ESLint boundary rules configuration
- [ ] jscpd duplication detection (threshold: 1% repo, 15 lines max)
- [ ] dependency-cruiser layer enforcement
- [ ] Husky pre-commit/pre-push hooks

### Phase 3: CI Enforcement
- [ ] `.github/workflows/reuse-enforcement.yml`
- [ ] Cell capability validator
- [ ] Danger.js PR checks
- [ ] Automated reuse compliance reporting

### Phase 4: Cell Architecture Enhancement
- [ ] Enhanced cell manifest schema
- [ ] Cell-SDK generator with reuse prompts
- [ ] Central capability registry
- [ ] Scaffolding with dependency mapping

## Consequences

### Positive
- **Eliminates code duplication** across the entire codebase
- **Ensures true modularity** with the WebWaka Biological Cell System
- **Accelerates development** through proven component reuse
- **Improves maintainability** with centralized logic
- **Enforces architectural compliance** automatically

### Negative
- **Initial learning curve** for developers adapting to reuse-first mindset
- **Upfront tooling setup** investment required
- **Possible refactoring** of existing duplicate code

## Examples

### ✅ CORRECT: Reusing Existing Cell
```typescript
// In new PaymentProcessing cell
import { CustomerProfileCell } from '../customer/CustomerProfile';
import { SalesEngineCell } from '../pos/SalesEngine';

// Reuse existing capabilities instead of duplicating
const paymentResult = await SalesEngineCell.processTransaction(data);
```

### ❌ INCORRECT: Creating Duplicate Logic
```typescript
// DO NOT DO THIS - creates duplicate customer logic
const customerData = {
  // duplicate customer validation logic
};
```

### ✅ CORRECT: Extending Existing Cell
```typescript
// Enhance existing InventoryTracking cell
export const InventoryTrackingEnhanced = {
  ...InventoryTrackingCell,
  serialNumberTracking: (data) => { /* new feature */ },
  batchManagement: (data) => { /* new feature */ }
};
```

## Compliance

This ADR is **MANDATORY** for all WebWaka development. Violations will result in:
1. **Blocked PRs** until compliance achieved
2. **CI failures** preventing deployment
3. **Code review rejection** for duplicate logic

## References

- WebWaka Biological Cell System Architecture
- CONTRIBUTING.md - Developer Guidelines
- Cell Capability Registry
- Reuse Enforcement Tooling Documentation