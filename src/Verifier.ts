import { 
    Field, 
    SmartContract, 
    method,
    Struct,
    Bool
} from 'o1js';
import { ZKML } from 'mina-zkml';

// Define the proof data structure with only necessary verification data
export class ZKMLProofData extends Struct({
    proofData: String,  // The actual proof data
    publicInput: String,  // Optional public input
    publicOutput: String, // Optional public output
}) {
    static fromJSON(x: { proofData: string, publicInput?: string, publicOutput?: string,  }): ZKMLProofData {
        return new ZKMLProofData({
            proofData: x.proofData,
            publicInput: JSON.stringify(x.publicInput),
            publicOutput: JSON.stringify(x.publicOutput),
        });
    }

    static fromProof(proofOutput: any, publicInput?: number[][], publicOutput?: number[][]): ZKMLProofData {
        try {
            // Validate and ensure proof is a proper JSON string
            let proofString: string;
            try {
                proofString = typeof proofOutput === 'string' 
                    ? JSON.parse(proofOutput) && proofOutput // validate JSON and use original if valid
                    : JSON.stringify(proofOutput);
            } catch (e) {
                throw new Error("Invalid proof data format");
            }
            // Format and validate inputs
            const formattedInput = publicInput?.map(row => 
                row.map(val => {
                    const num = Number(val);
                    if (isNaN(num)) throw new Error("Invalid public input value");
                    return num;
                })
            );

            // Format and validate outputs
            const formattedOutput = publicOutput?.map(row => 
                row.map(val => {
                    const num = Number(val);
                    if (isNaN(num)) throw new Error("Invalid public output value");
                    return num;
                })
            );

            return new ZKMLProofData({
                proofData: proofString,
                publicInput: formattedInput ? JSON.stringify(formattedInput) : "",
                publicOutput: formattedOutput ? JSON.stringify(formattedOutput) : "",
            });
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to create proof data: ${errorMessage}`);
        }
    }
}

export class ZKMLVerifier extends SmartContract {
    private static verifierIndexSystem: any;
    private static proofData: ZKMLProofData;

    static setVerifierSystem(verifierSystem: any) {
        if (!verifierSystem) {
            throw new Error('Verifier system is required');
        }
        ZKMLVerifier.verifierIndexSystem = verifierSystem;
    }

    static setProofData(proofData: ZKMLProofData) {
        if (!proofData) {
            throw new Error('Proof data is required');
        }
        ZKMLVerifier.proofData = proofData;
    }

    @method async verifyProof(proofData?: ZKMLProofData): Promise<void> {        
        // Use passed in proofData if available, otherwise use static proofData
        let proofToVerify = ZKMLVerifier.proofData;
        if (proofData && proofData.proofData) {
            try {
                JSON.parse(proofData.proofData);
                proofToVerify = proofData;
            } catch (e) {
                console.warn("Invalid proof data format, using default proof data");
            }
        }
        // Validate inputs
        if (!proofToVerify || !ZKMLVerifier.verifierIndexSystem) {
            console.error("Invalid proof data or verifier system:", proofToVerify);
            return;
        }
        console.log("Verifying proof data:", proofToVerify);
        try {
            // Parse and validate proof data
            let proof: string;
            try {
                // Ensure proof is valid JSON string
                const parsedProof = JSON.parse(proofToVerify.proofData);
                proof = JSON.stringify(parsedProof);
            } catch (e) {
                throw new Error("Invalid proof data format" + e);
            }

            // Parse public inputs and outputs if present
            const publicInput = proofToVerify.publicInput ? JSON.parse(proofToVerify.publicInput) as number[][] : undefined;
            const publicOutput = proofToVerify.publicOutput ? JSON.parse(proofToVerify.publicOutput) as number[][] : undefined;

            // Verify using the verifier system directly
            let isValid = false;
            try {
                isValid = await ZKML.verify(
                    proof,
                    ZKMLVerifier.verifierIndexSystem,
                    publicInput,
                    publicOutput
                );
                if (!isValid) {
                    throw new Error("Proof verification returned false");
                }
            } catch (error) {
                throw new Error(`Proof verification failed: ${error}`);
            }
            // Assert the verification result
            Bool(isValid).assertTrue("Proof verification failed");
        } catch (error: any) {
            console.error("Verification error:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Proof verification failed: ${errorMessage}`);
        }
    }
}
