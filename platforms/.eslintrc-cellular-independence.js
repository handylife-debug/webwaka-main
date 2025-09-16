/**
 * ESLint Configuration for WebWaka Cellular Independence
 * Prevents cross-cell imports to ensure cellular isolation
 */

module.exports = {
  extends: [".eslintrc.js"],
  rules: {
    // Prevent direct cross-cell imports (Phase 0 Guardrails)
    "no-restricted-imports": [
      "error",
      {
        "patterns": [
          {
            "group": ["**/cells/**/src/**"],
            "message": "❌ CELLULAR INDEPENDENCE VIOLATION: Direct cross-cell imports are forbidden! Use CellGatewayClient instead.",
            "allowTypeImports": false
          },
          {
            "group": ["@/cells/**/src/**", "../cells/**/src/**", "../../cells/**/src/**"],
            "message": "❌ CELLULAR INDEPENDENCE VIOLATION: Use cell-gateway API calls instead of direct imports.",
            "allowTypeImports": false  
          }
        ],
        "paths": [
          {
            "name": "@/cells/customer/CustomerProfile/src/server",
            "message": "❌ Use getCellGateway().getCustomer() instead of direct CustomerProfileCell import"
          },
          {
            "name": "@/cells/customer/CustomerEngagement/src/server", 
            "message": "❌ Use getCellGateway().trackEngagement() instead of direct CustomerEngagementCell import"
          },
          {
            "name": "@/cells/ecommerce/B2BAccessControl/src/server",
            "message": "❌ Use getCellGateway().checkB2BAccess() instead of direct B2BAccessControlCell import"
          },
          {
            "name": "@/cells/ecommerce/WholesalePricingTiers/src/server",
            "message": "❌ Use getCellGateway().calculateWholesalePrice() instead of direct WholesalePricingTiersCell import"
          }
        ]
      }
    ]
  },
  overrides: [
    {
      // Allow imports within the same cell
      files: ["platforms/cells/*/src/**"],
      rules: {
        "no-restricted-imports": [
          "error", 
          {
            "patterns": [
              {
                "group": ["**/cells/!(*/src)/**/src/**"],
                "message": "❌ Cross-cell import detected! Use CellGatewayClient API."
              }
            ]
          }
        ]
      }
    },
    {
      // Cell gateway library can import contracts
      files: ["platforms/lib/cell-gateway/**", "platforms/lib/cell-contracts/**"],
      rules: {
        "no-restricted-imports": "off"
      }
    },
    {
      // API routes can import cell contracts for typing  
      files: ["platforms/app/api/cells/**"],
      rules: {
        "no-restricted-imports": "off"
      }
    }
  ]
};