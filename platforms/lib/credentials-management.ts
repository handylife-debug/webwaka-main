// Credentials Management using Replit Secrets
// All API keys are stored as environment variables via Replit's Secrets feature

export interface ServiceCredential {
  key: string;
  name: string;
  description: string;
  required: boolean;
  isSet: boolean;
  value?: string; // Only used for verification, never stored
}

export interface CredentialsStatus {
  paystack: {
    publicKey: ServiceCredential;
    secretKey: ServiceCredential;
  };
  betaSMS: {
    username: ServiceCredential;
    password: ServiceCredential;
  };
  verifyMe: {
    apiKey: ServiceCredential;
    publicKey: ServiceCredential;
  };
}

// Define the expected credentials configuration
const CREDENTIALS_CONFIG = {
  paystack: {
    publicKey: {
      key: 'PAYSTACK_PUBLIC_KEY',
      name: 'Paystack Public Key',
      description: 'Public key for Paystack payment integration',
      required: true,
    },
    secretKey: {
      key: 'PAYSTACK_SECRET_KEY',
      name: 'Paystack Secret Key',
      description: 'Secret key for Paystack payment processing',
      required: true,
    },
  },
  betaSMS: {
    username: {
      key: 'BETASMS_USERNAME',
      name: 'BetaSMS Username',
      description: 'Username for BetaSMS API',
      required: true,
    },
    password: {
      key: 'BETASMS_PASSWORD',
      name: 'BetaSMS Password',
      description: 'Password for BetaSMS API',
      required: true,
    },
  },
  verifyMe: {
    apiKey: {
      key: 'VERIFYME_API_KEY',
      name: 'VerifyMe API Key',
      description: 'API key for VerifyMe identity verification',
      required: true,
    },
    publicKey: {
      key: 'VERIFYME_PUBLIC_KEY',
      name: 'VerifyMe Public Key',
      description: 'Public key for VerifyMe verification',
      required: true,
    },
  },
} as const;

/**
 * Get the current status of all credentials
 * Checks if environment variables are set without exposing values
 */
export function getCredentialsStatus(): CredentialsStatus {
  const status: CredentialsStatus = {
    paystack: {
      publicKey: {
        ...CREDENTIALS_CONFIG.paystack.publicKey,
        isSet: !!process.env.PAYSTACK_PUBLIC_KEY,
      },
      secretKey: {
        ...CREDENTIALS_CONFIG.paystack.secretKey,
        isSet: !!process.env.PAYSTACK_SECRET_KEY,
      },
    },
    betaSMS: {
      username: {
        ...CREDENTIALS_CONFIG.betaSMS.username,
        isSet: !!process.env.BETASMS_USERNAME,
      },
      password: {
        ...CREDENTIALS_CONFIG.betaSMS.password,
        isSet: !!process.env.BETASMS_PASSWORD,
      },
    },
    verifyMe: {
      apiKey: {
        ...CREDENTIALS_CONFIG.verifyMe.apiKey,
        isSet: !!process.env.VERIFYME_API_KEY,
      },
      publicKey: {
        ...CREDENTIALS_CONFIG.verifyMe.publicKey,
        isSet: !!process.env.VERIFYME_PUBLIC_KEY,
      },
    },
  };

  return status;
}

/**
 * Get masked version of a credential for display purposes (server-side only)
 * Shows first 4 and last 4 characters with asterisks in between
 * Note: This should only be called on the server side where env vars are available
 */
export function getMaskedCredential(value: string): string {
  if (!value || value.length < 8) {
    return '****';
  }
  
  const first = value.substring(0, 4);
  const last = value.substring(value.length - 4);
  const middle = '*'.repeat(Math.max(4, value.length - 8));
  
  return `${first}${middle}${last}`;
}

/**
 * Verify that a credential is properly formatted
 * This helps validate that secrets were set correctly
 */
export function validateCredentialFormat(key: string, value: string): { valid: boolean; error?: string } {
  if (!value || value.trim().length === 0) {
    return { valid: false, error: 'Credential value cannot be empty' };
  }

  const trimmedValue = value.trim();

  switch (key) {
    case 'PAYSTACK_PUBLIC_KEY':
      if (!trimmedValue.startsWith('pk_')) {
        return { valid: false, error: 'Paystack public key must start with "pk_"' };
      }
      if (trimmedValue.length < 20) {
        return { valid: false, error: 'Paystack public key appears to be too short' };
      }
      break;

    case 'PAYSTACK_SECRET_KEY':
      if (!trimmedValue.startsWith('sk_')) {
        return { valid: false, error: 'Paystack secret key must start with "sk_"' };
      }
      if (trimmedValue.length < 20) {
        return { valid: false, error: 'Paystack secret key appears to be too short' };
      }
      break;

    case 'BETASMS_USERNAME':
      if (trimmedValue.length < 3) {
        return { valid: false, error: 'BetaSMS username appears to be too short' };
      }
      break;

    case 'BETASMS_PASSWORD':
      if (trimmedValue.length < 6) {
        return { valid: false, error: 'BetaSMS password appears to be too short' };
      }
      break;

    case 'VERIFYME_API_KEY':
    case 'VERIFYME_PUBLIC_KEY':
      if (trimmedValue.length < 10) {
        return { valid: false, error: 'VerifyMe key appears to be too short' };
      }
      break;

    default:
      break;
  }

  return { valid: true };
}

/**
 * Get overall credentials health status
 */
export function getCredentialsHealth(): {
  allSet: boolean;
  totalCredentials: number;
  setCredentials: number;
  missingCredentials: string[];
} {
  const status = getCredentialsStatus();
  const missingCredentials: string[] = [];
  let setCount = 0;
  let totalCount = 0;

  // Check all credentials
  const services = [status.paystack, status.betaSMS, status.verifyMe];
  services.forEach(service => {
    const credentials = Object.values(service) as ServiceCredential[];
    credentials.forEach(credential => {
      totalCount++;
      if (credential.isSet) {
        setCount++;
      } else if (credential.required) {
        missingCredentials.push(credential.name);
      }
    });
  });

  return {
    allSet: setCount === totalCount,
    totalCredentials: totalCount,
    setCredentials: setCount,
    missingCredentials,
  };
}

/**
 * Get instructions for setting up credentials
 */
export function getSetupInstructions(): string[] {
  return [
    '1. Click on "Secrets" in the left sidebar of your Replit workspace',
    '2. Click "Add new secret" button',
    '3. Enter the secret key name exactly as shown (case-sensitive)',
    '4. Enter the secret value (API key, username, password, etc.)',
    '5. Click "Add secret"',
    '6. Repeat for all required credentials',
    '7. Restart your application for changes to take effect',
    '',
    'Note: Secrets are encrypted and secure. They will be available as environment variables in your application.'
  ];
}