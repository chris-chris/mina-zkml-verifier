/**
 * This script interacts with the ZKMLVerifier contract to verify ZKML proofs.
 *
 * To run locally:
 * Build the project: `$ npm run build`
 * Run with node:     `$ node build/zkContractApp/src/interact.js <deployAlias> <modelPath>`.
 */
import fs from 'fs/promises';
import { 
    Mina, 
    NetworkId, 
    PrivateKey,
    PublicKey,
    AccountUpdate
} from 'o1js';
import { ZKMLVerifier, ZKMLProofData } from './Verifier.js';
import { ZKML } from 'mina-zkml';

// check command line args
let [deployAlias, modelPath] = process.argv.slice(2);
if (!deployAlias || !modelPath)
  throw Error(`Missing arguments.

Usage:
node build/zkContractApp/src/interact.js <deployAlias> <modelPath>
`);

Error.stackTraceLimit = 1000;
const DEFAULT_NETWORK_ID = 'devnet';

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

async function main() {
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

    // Initialize ZKML with model using config
    console.log("Loading model...");
    const zkml = await ZKML.create(modelPath, 
        { variables: modelConfig.modelConfig.variables },
        modelConfig.modelConfig.visibility
    );

    // Export verifier system first
    console.log("Exporting verifier...");
    const verifierIndexSystem = await zkml.exportVerifier();
    if (!verifierIndexSystem) {
        throw new Error("Failed to export verifier system");
    }
    console.log("Verifier system exported successfully");

    // Create input and generate proof using config
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
        return;
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


    try {
        // Verify the proof
        console.log('Verifying proof...');
        let tx = await Mina.transaction(
            { sender: feepayerAddress, fee },
            async () => {
                await zkApp.verifyProof();
            }
        );
        await tx.prove();
        
        console.log('Sending transaction...');
        const sentTx = await tx.sign([feepayerKey]).send();
        
        if (sentTx.status === 'pending') {
            console.log(
                '\nSuccess! Verification transaction sent.\n' +
                '\nTransaction will be included in a block soon:' +
                `\n${getTxnUrl(config.url, sentTx.hash)}`
            );
        }
    } catch (err) {
        console.log(err);
    }
}

function getTxnUrl(graphQlUrl: string, txnHash: string | undefined) {
    const hostName = new URL(graphQlUrl).hostname;
    const txnBroadcastServiceName = hostName
        .split('.')
        .filter((item) => item === 'minascan')?.[0];
    const networkName = graphQlUrl
        .split('/')
        .filter((item) => item === 'mainnet' || item === 'devnet')?.[0];
    if (txnBroadcastServiceName && networkName) {
        return `https://minascan.io/${networkName}/tx/${txnHash}?type=zk-tx`;
    }
    return `Transaction hash: ${txnHash}`;
}

main().catch(error => {
    console.error('Unhandled error:', error);
    if (error instanceof Error) {
        console.error('Stack:', error.stack);
    }
    process.exit(1);
});
