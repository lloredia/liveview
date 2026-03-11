module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  
  roots: ["<rootDir>"],
  testMatch: [
    "**/__tests__/**/*.test.[jt]s?(x)",
    "**/?(*.)+(spec|test).[jt]s?(x)"
  ],
  
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@/components/(.*)$": "<rootDir>/components/$1",
    "^@/lib/(.*)$": "<rootDir>/lib/$1",
    "^@/hooks/(.*)$": "<rootDir>/hooks/$1",
    "^@/types/(.*)$": "<rootDir>/types/$1",
  },
  
  setupFilesAfterEnv: [
    "<rootDir>/jest.setup.js"
  ],
  
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "react-jsx",
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
  
  collectCoverageFrom: [
    "app/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "lib/**/*.{ts,tsx}",
    "hooks/**/*.{ts,tsx}",
    "!**/*.d.ts",
    "!**/next-env.d.ts",
    "!**/node_modules/**",
    "!**/.next/**",
  ],
  
  coverageThresholds: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  
  testTimeout: 10000,
  
  globals: {
    "ts-jest": {
      isolatedModules: true,
    },
  },
};
