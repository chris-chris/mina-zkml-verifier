import fs from 'fs/promises';
import { ZKML } from 'mina-zkml';

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

async function generateAndSaveProof(modelPath: string, outputPath: string) {
    let modelConfig: ModelConfig = JSON.parse(await fs.readFile('modelConfig.json', 'utf8'));
    try {
        // Initialize ZKML with model
        console.log("Loading model...");
        const zkml = await ZKML.create(modelPath, {
            variables: modelConfig.modelConfig.variables
        }, modelConfig.modelConfig.visibility);

        // Create input and generate proof
        console.log("Generating proof...");
        const inputs = modelConfig.modelConfig.defaultInput;
        const proofOutput = await zkml.prove(inputs);

        // Parse and format proof data
        const parsedProof = JSON.parse(proofOutput.proof);

        // Save proof to JSON file
        await fs.writeFile(outputPath + "output.json", JSON.stringify({
            proofData: JSON.stringify(parsedProof),
        }, null, 2));
        console.log(`Proof successfully saved to ${outputPath}`);
    } catch (error) {
        console.error("Error generating or saving proof:", error);
        process.exit(1);
    }
}

// Check command line args
const [modelPath, outputPath] = process.argv.slice(2);
if (!modelPath || !outputPath) {
    console.error(`
Missing arguments.

Usage:
node build/src/generateProof.js <modelPath> <outputPath>
`);
    process.exit(1);
}

generateAndSaveProof(modelPath, outputPath).catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
