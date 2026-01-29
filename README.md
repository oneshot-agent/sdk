# @oneshot/sdk

Autonomous Agent SDK for executing real-world commercial transactions with automatic x402 payments.

## Installation

```bash
npm install @oneshot/sdk
```

## Quick Start

```typescript
import { OneShot } from '@oneshot/sdk';

const agent = new OneShot({
  privateKey: process.env.AGENT_PRIVATE_KEY!
});

// Send email
await agent.email({
  to: 'user@example.com',
  subject: 'Hello',
  body: 'Hello World!'
});

// Make a voice call
const call = await agent.voice({
  objective: 'Call the restaurant to make a reservation for 2 at 7pm',
  target_number: '+14155551234'
});
console.log(call.transcript);

// Send SMS
await agent.sms({
  message: 'Your order has shipped!',
  to_number: '+14155551234'
});

// Research
const report = await agent.research({ topic: 'AI agents', depth: 'deep' });

// Check balance
const balance = await agent.getBalance(agent.usdcAddress);
```

## Test vs Production Mode

The SDK defaults to **test mode** for safety - no real money until you explicitly opt-in.

```typescript
// Test mode (default) - Base Sepolia testnet
const agent = new OneShot({
  privateKey: process.env.AGENT_PRIVATE_KEY!
});
agent.isTestMode;      // true
agent.usdcAddress;     // 0x036CbD53842c5426634e7929541eC2318f3dCF7e
agent.expectedChainId; // 84532

// Production mode - Base mainnet (real USDC)
const prodAgent = new OneShot({
  privateKey: process.env.AGENT_PRIVATE_KEY!,
  testMode: false
});
```

Get testnet USDC from the [Circle Faucet](https://faucet.circle.com/).

## Available Methods

| Method | Description |
|--------|-------------|
| `email()` | Send emails with attachments |
| `voice()` | Make voice calls |
| `sms()` | Send SMS messages |
| `smsInboxList()` | List inbound SMS |
| `smsInboxGet()` | Get SMS by ID |
| `research()` | Deep web research |
| `peopleSearch()` | Search people by criteria |
| `enrichProfile()` | Enrich from LinkedIn/email |
| `findEmail()` | Find email for a person |
| `verifyEmail()` | Verify email deliverability |
| `commerceBuy()` | Purchase products |
| `commerceSearch()` | Search products |
| `inboxList()` | List inbound emails |
| `inboxGet()` | Get email by ID |
| `getBalance()` | Check token balance |

## Configuration

```typescript
interface OneShotConfig {
  privateKey: string;    // Required
  testMode?: boolean;    // Default: true (testnet)
  baseUrl?: string;      // Override API URL
  rpcUrl?: string;       // Override RPC URL
  debug?: boolean;       // Enable logging
  logger?: (msg: string) => void;
}
```

## Tool Options

All methods accept these common options:

```typescript
interface ToolOptions {
  maxCost?: number;      // Max USDC willing to pay
  timeout?: number;      // Timeout in seconds
  signal?: AbortSignal;  // Cancel before payment (see Cancellation section)
  wait?: boolean;        // Wait for async jobs (default: true)
  onStatusUpdate?: (status: string, requestId: string) => void;
}
```

## Error Handling

```typescript
import {
  ValidationError,
  ToolError,
  JobError,
  JobTimeoutError,
  ContentBlockedError,
  EmergencyNumberError
} from '@oneshot/sdk';

try {
  await agent.voice({
    objective: 'Make a call',
    target_number: '+14155551234'
  });
} catch (error) {
  if (error instanceof ContentBlockedError) {
    // Content blocked by safety filters
    console.log(`Blocked: ${error.message}`);
    console.log(`Categories: ${error.categories.join(', ')}`);
  } else if (error instanceof EmergencyNumberError) {
    // Attempted to call/SMS emergency number
    console.log(`Emergency number blocked: ${error.blockedNumber}`);
  } else if (error instanceof ValidationError) {
    console.log(`Invalid: ${error.field}`);
  } else if (error instanceof ToolError) {
    console.log(`API error: ${error.statusCode}`);
  } else if (error instanceof JobTimeoutError) {
    console.log(`Timeout: ${error.jobId}`);
  }
}
```

## Examples

### Voice Calls

```typescript
// Simple call
const call = await agent.voice({
  objective: 'Call to schedule a dentist appointment for next Tuesday',
  target_number: '+14155551234',
  caller_persona: 'A polite assistant scheduling an appointment',
  context: 'Patient prefers morning appointments',
  maxCost: 5
});

console.log('Transcript:', call.transcript);
console.log('Summary:', call.summary);
console.log('Success:', call.success_evaluation);

// Conference call (multiple numbers)
const conference = await agent.voice({
  objective: 'Connect the buyer and seller to negotiate the final price',
  target_number: ['+14155551234', '+14155555678'],
  caller_persona: 'A professional meeting facilitator'
});
```

### SMS

```typescript
// Single recipient
await agent.sms({
  message: 'Your appointment is confirmed for tomorrow at 10am',
  to_number: '+14155551234'
});

// Multiple recipients (up to 10)
await agent.sms({
  message: 'Team meeting moved to 3pm',
  to_number: ['+14155551234', '+14155555678', '+14155559012']
});

// Check SMS inbox
const inbox = await agent.smsInboxList({ limit: 10 });
for (const msg of inbox.messages) {
  console.log(`From ${msg.from}: ${msg.body}`);
}

// Get specific message
const msg = await agent.smsInboxGet('msg_abc123');
```

### Email with Attachments

```typescript
await agent.email({
  to: ['alice@example.com', 'bob@example.com'],
  subject: 'Report',
  body: 'See attached.',
  attachments: [{
    filename: 'report.pdf',
    content: base64Content,
    content_type: 'application/pdf'
  }]
});
```

### People Search & Enrichment

```typescript
const results = await agent.peopleSearch({
  job_titles: ['CEO', 'CTO'],
  companies: ['Stripe'],
  limit: 10
});

const profile = await agent.enrichProfile({
  linkedin_url: results.results[0].linkedin_url
});
```

### Commerce

```typescript
const order = await agent.commerceBuy({
  product_url: 'https://amazon.com/dp/B07ZPC9QD4',
  shipping_address: {
    first_name: 'John',
    last_name: 'Doe',
    street: '123 Main St',
    city: 'San Francisco',
    state: 'CA',
    zip_code: '94102',
    country: 'US',
    phone: '4155550100'
  },
  maxCost: 100
});
```

### Cancellation

Use `AbortSignal` to cancel operations **before payment is made**. Once payment is signed, the operation will execute regardless of cancellation.

```typescript
const controller = new AbortController();

// Cancel after 5 seconds if still in quote phase
setTimeout(() => controller.abort(), 5000);

try {
  await agent.voice({
    objective: 'Make a reservation',
    target_number: '+14155551234',
    signal: controller.signal
  });
} catch (error) {
  if (error.message === 'Operation cancelled before payment') {
    console.log('Cancelled before paying - no charge');
  }
}
```

**Important:** The signal can cancel:
- Quote requests (before receiving price)
- The decision phase (after quote, before payment)

The signal **cannot** cancel:
- Operations after payment is signed (call/SMS will still execute)
- Server-side job execution

## Environment Constants

```typescript
import { TEST_ENV, PROD_ENV } from '@oneshot/sdk';

TEST_ENV.chainId;     // 84532
TEST_ENV.usdcAddress; // 0x036CbD53842c5426634e7929541eC2318f3dCF7e

PROD_ENV.chainId;     // 8453
PROD_ENV.usdcAddress; // 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

## License

MIT
