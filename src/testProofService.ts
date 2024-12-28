import axios, { AxiosError } from 'axios';
import fs from 'fs';

interface ProofResponse {
  status: string;
  transactionUrl?: string;
  error?: string;
}

const proofPath = 'output.json';

//Read the proof data from the file
const proofData = await fs.readFileSync(proofPath, 'utf8');


async function testProofVerification() {
  try {
    const response = await axios.post<ProofResponse>(
      'http://localhost:3000/api/verify-proof', 
      {
        proofData: proofData,
        publicInput: [[1.0, 0.5, -0.3, 0.8, -0.2, 0.0, 0.0, 0.0, 0.0, 0.0]]
      }
    );

    console.log('Proof verification result:', response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<ProofResponse>;
      console.error('Proof verification failed:', axiosError.response?.data);
    } else if (error instanceof Error) {
      console.error('Error:', error.message);
    } else {
      console.error('Unknown error occurred');
    }
  }
}

// Run the test
testProofVerification();
