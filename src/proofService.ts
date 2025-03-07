import express, { Request, Response, Application } from 'express';
import { ZKMLVerifier, ZKMLProofData } from './Verifier.js';
import { ZKML } from 'mina-zkml';
import { Mina, NetworkId, PrivateKey } from 'o1js';
import fs from 'fs/promises';

const app: Application = express();
app.use(express.json());

const PORT = 3000;
Error.stackTraceLimit = 1000;
const DEFAULT_NETWORK_ID = 'devnet';
const deployAlias = 'testnet';
let modelPath = 'models/simple_perceptron.onnx';

// parse config and private key from file
type Config = {
  deployAliases: Record<
    string,
    {
      networkId?: string;
      url: string;
      keyPath: string;
      fee: string;
      feepayerKeyPath: string;
      feepayerAlias: string;
    }
  >;
};

type ModelConfig = {
  modelConfig: {
      modelPath: string;
      variables: {
          [key: string]: number;
      };
      visibility: {
          input: "Public" | "Private";
          output: "Public" | "Private";
      };
      defaultInput: number[][];
  };
}


let configJson: Config = JSON.parse(await fs.readFile('config.json', 'utf8'));
let modelConfig: ModelConfig = JSON.parse(await fs.readFile('modelConfig.json', 'utf8'));
let config = configJson.deployAliases[deployAlias];
let feepayerKeysBase58: { privateKey: string; publicKey: string } = JSON.parse(
    await fs.readFile(config.feepayerKeyPath, 'utf8')
);

let zkAppKeysBase58: { privateKey: string; publicKey: string } = JSON.parse(
    await fs.readFile(config.keyPath, 'utf8')
);

let feepayerKey = PrivateKey.fromBase58(feepayerKeysBase58.privateKey);
let zkAppKey = PrivateKey.fromBase58(zkAppKeysBase58.privateKey);

// set up Mina instance and contract
const Network = Mina.Network({
    networkId: (config.networkId ?? DEFAULT_NETWORK_ID) as NetworkId,
    mina: config.url,
});
const fee = Number(config.fee) * 1e9;
Mina.setActiveInstance(Network);
let feepayerAddress = feepayerKey.toPublicKey();
let zkAppAddress = zkAppKey.toPublicKey();

// Initialize ZKML with model and public visibility first
console.log("Loading model...");
modelPath = modelConfig.modelConfig.modelPath || modelPath;
const zkml = await ZKML.create(modelPath, {
    variables: modelConfig.modelConfig.variables
}, modelConfig.modelConfig.visibility);

// Export verifier system first
console.log("Exporting verifier...");
const verifierIndexSystem = await zkml.exportVerifier();
if (!verifierIndexSystem) {
    throw new Error("Failed to export verifier system");
}
console.log("Verifier system exported successfully");

// Create input and generate proof
console.log("Generating proof...");
const inputs = modelConfig.modelConfig.defaultInput;
const proofOutput = await zkml.prove(inputs);

try {
    // Parse and prepare proof data
    console.log("Preparing proof data...");
    const parsedProof = JSON.parse(proofOutput.proof);
    
    // Create proof data with explicit verifier system
    console.log("Creating proof data with verifier system...");
    const zkmlProofData = ZKMLProofData.fromProof(
        JSON.stringify(parsedProof, null, 2),
        inputs,
        proofOutput.output
    );

    ZKMLVerifier.setProofData(zkmlProofData);
} catch (error) {
    console.error("Failed to create proof data:", error);
    process.exit(1);
}

// Set the verifier system statically before compilation
console.log("Setting static verifier system...");
ZKMLVerifier.setVerifierSystem(verifierIndexSystem)

// Compile the contract with the verifier system set
console.log('Compiling contract...');
await ZKMLVerifier.compile();

// Initialize contract instance
console.log("Initializing contract instance...");
let zkApp = new ZKMLVerifier(zkAppAddress);

console.log('Base Service setup complete for model:', modelPath);


interface ProofResponse {
  status: string;
  transactionUrl?: string;
  error?: string;
}

const router = express.Router();

interface ProofRequest {
  proofData: string;
  publicInput: number[][];
}

router.post('/verify-proof', async (req: Request<{}, ProofResponse, ProofRequest>, res: Response<ProofResponse>) => {
  try {
    const { proofData, publicInput } = req.body as ProofRequest;
    // Validate inputs
    if (!proofData || typeof proofData !== 'string') {
      return res.status(400).json({ 
        status: 'error', 
        error: 'Invalid proofData: Must be a valid JSON string' 
      });
    }

    // Validate JSON structure of proofData
    try {
      JSON.parse(proofData);
    } catch (error) {
      return res.status(400).json({ 
        status: 'error', 
        error: 'Invalid proofData: Must be valid JSON' 
      });
    }

    if (!zkApp) {
      throw new Error('ZKML instance not initialized');
    }

    // Parse proof data
    // Parse the complete proof structure
    const parsedProofData = JSON.parse(proofData);
    
    // Validate the proof structure
    if (!parsedProofData.proofData) {
      throw new Error('Invalid proof structure: missing proofData');
    }

    // Parse the inner proof data
    const parsedProof = JSON.parse(parsedProofData.proofData);
    
    // Validate publicInput
    if (!Array.isArray(publicInput) || publicInput.length === 0) {
      return res.status(400).json({ 
        status: 'error', 
        error: 'Invalid publicInput: Must be a non-empty array of numbers' 
      });
    }
    
    const inputs = [publicInput];
    
    const zkmlProofData = ZKMLProofData.fromProof(
      parsedProofData.proofData, // Use the complete proof data string
      publicInput,
      parsedProof.output
    );

    // Verify proof
    const tx = await Mina.transaction(
      { sender: feepayerAddress, fee },
      async () => {
        await zkApp.verifyProof(zkmlProofData);
      }
    );

    await tx.prove();
    const sentTx = await tx.sign([feepayerKey]).send();

    if (sentTx.status === 'pending') {
      return res.json({
        status: 'success',
        transactionUrl: `https://minascan.io/devnet/tx/${sentTx.hash}?type=zk-tx`
      });
    }

      return res.status(400).json({ status: 'error', error: 'Proof verification failed' });
  } catch (error) {
    console.error('Proof verification error:', error);
      return res.status(500).json({ status: 'error', error: 'Proof Failed' });
  }
});

app.use('/api', router as express.Router);

app.listen(PORT, () => {
  console.log(`Proof verification service running on port ${PORT}`);
});
