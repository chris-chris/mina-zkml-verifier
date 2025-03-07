# zkML Verifier

A zero-knowledge machine learning verification system built using o1js and mina-zkml. This project provides a smart contract and API service for verifying zkML proofs on the Mina blockchain.

## Features

- zkML proof verification using o1js smart contracts
- REST API for proof verification
- Support for ONNX models
- Mina blockchain integration
- Comprehensive input validation
- Detailed error handling

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/chris-chris/mina-zkml-verifier.git
   cd mina-zkml-verifier
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up configuration:
   - Create a `config.json` using the zk CLI.
   - You can use the zk CLI to configure your Mina network settings
   - Configure your Mina network settings

4. Deploy the contract:
   ```bash
   zk deploy <NETWORK NAME>
   ```

## Usage

### API Service (Example Model)

Start the verification service:
```bash
npm run serve
```

The service will be available at `http://localhost:3000/api/verify-proof`

#### Generating the Proof Data
1. Configure the input data in the `generateProof.js` script, before running `npm run build`.
2. Build the project:
   ```bash
   npm run build
   ```
1. For generating the proof data, you can use the `generateProof.js` script:
   ```bash
   node generateProof.js <MODEL PATH>
   ```

#### Example Request

```bash
curl -X POST http://localhost:3000/api/verify-proof \
  -H "Content-Type: application/json" \
  -d '{
    "proofData": "your-proof-data",
    "publicInput": [[1, 2, 3]]
  }'
```

#### Response

```json
{
  "status": "success",
  "transactionUrl": "https://minascan.io/devnet/tx/...?type=zk-tx"
}
```

### Smart Contract (Custom Model)
For using a custom model, you can follow the steps below:
1. Begin by updating the `modelConfig.json` file with the model parameters.
2. Update the modelPath in the `modelConfig.json` file with the path to your custom model.
3. Then use the appropriate model path when invoking the `interact.js` script for interacting with the smart contract.

### Smart Contract

Import and use the ZKMLVerifier in your o1js project:

```typescript
import { ZKMLVerifier, ZKMLProofData } from 'zkml-verifier';

// Set up verifier
ZKMLVerifier.setVerifierSystem(verifierSystem);
ZKMLVerifier.setProofData(proofData);

// Verify proof
await ZKMLVerifier.verifyProof();
```
