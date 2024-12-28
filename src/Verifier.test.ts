import { ZKMLVerifier, ZKMLProofData } from './Verifier';
import { 
    AccountUpdate, 
    Mina, 
    PrivateKey, 
    PublicKey,
} from 'o1js';
import { ZKML } from 'mina-zkml';

let proofsEnabled = false;

describe('ZKMLVerifier', () => {
    let deployerKey: PrivateKey,
        deployerAccount: PublicKey,
        zkAppPrivateKey: PrivateKey,
        zkAppAddress: PublicKey,
        zkApp: ZKMLVerifier,
        senderAccount: PublicKey,
        senderKey: PrivateKey;

    async function localDeploy(zkApp: ZKMLVerifier) {
        const txn = await Mina.transaction(deployerAccount, async () => {
            AccountUpdate.fundNewAccount(deployerAccount);
            await zkApp.deploy();
        });
        await txn.prove();
        await txn.sign([deployerKey, zkAppPrivateKey]).send();
    }

    beforeAll(async () => {
        if (proofsEnabled) await ZKMLVerifier.compile();
    });

    beforeEach(async () => {
        const Local = await Mina.LocalBlockchain({ proofsEnabled });
        Mina.setActiveInstance(Local);
        deployerKey = Local.testAccounts[0].key;
        deployerAccount = deployerKey.toPublicKey();
        senderKey = Local.testAccounts[1].key;
        senderAccount = senderKey.toPublicKey();
        zkAppPrivateKey = PrivateKey.random();
        zkAppAddress = zkAppPrivateKey.toPublicKey();
    });

    it('verifies valid and invalid ZKML proofs', async () => {
        try {
            // Initialize ZKML with model and public visibility
            console.log("Loading model...");
            let modelPath = "models/simple_perceptron.onnx";
            const zkml = await ZKML.create(modelPath, {
                variables: { batch_size: 1 }
            }, {
                input: "Public",
                output: "Public"
            });

            // Export verifier system first
            console.log("Exporting verifier...");
            const verifierIndexSystem = await zkml.exportVerifier();
            if (!verifierIndexSystem) {
                throw new Error("Failed to export verifier system");
            }
            console.log("Verifier system exported successfully");

            // Create input and generate proof
            console.log("Generating proof...");
            const inputs = [[1.0, 0.5, -0.3, 0.8, -0.2, 0.0, 0.0, 0.0, 0.0, 0.0]];
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
            // Deploy contract and initialize verifier
            await localDeploy(zkApp);
            // Test 1: Valid proof with public input/output
            console.log("Testing valid proof...");
            console.log("Preparing proof data...");
            const parsedProof = JSON.parse(proofOutput.proof);
            const validProofData = ZKMLProofData.fromProof(
                JSON.stringify(parsedProof, null, 2),
                inputs,
                proofOutput.output
            );

            try {
            let txn = await Mina.transaction(
                { sender: senderAccount, fee: 0.1 * 1e9 },
                async () => {
                    await zkApp.verifyProof(validProofData);
                }
            );
                await txn.prove();
                await txn.sign([senderKey]).send();
            } catch (error) {
                console.error("Failed to verify proof:", error);
                throw error;
            }


            // Test 2: Invalid proof (mismatched public input/output)
            console.log("Testing invalid proof (mismatched public data)...");
            const invalidProofData2 = new ZKMLProofData({
                proofData: proofOutput.proof,
                publicInput: JSON.stringify([inputs[0].map(x => x + 1)]),
                //@ts-ignore
                publicOutput: JSON.stringify([proofOutput.output[0].map(x => x + 1)])
            });

            let failed = false;
            try {
                let txn = await Mina.transaction(senderAccount, async () => {
                    await zkApp.verifyProof(invalidProofData2);
                });
                await txn.prove();
                await txn.sign([senderKey]).send();
            } catch (e: any) {
                console.log("Expected error with mismatched data:", e?.message || e);
                failed = true;
            }
            expect(failed).toBe(true);

        } catch (error) {
            console.error("Test error:", error);
            throw error;
        }
    });
});
