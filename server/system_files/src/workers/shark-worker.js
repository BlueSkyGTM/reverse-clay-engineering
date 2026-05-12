import { parentPort, workerData } from 'worker_threads';
import { extractJson, normalizeNemoPayload, extractFundingSignal } from '../utils/parser.js';

/**
 * Worker thread for heavy JSON mapping and synthesis preparation.
 * Prevents the main event loop from blocking during high-volume outreach synthesis.
 */
const { rawResponse, batchData } = workerData;

try {
  const result = extractJson(rawResponse);
  if (!Array.isArray(result)) {
    throw new Error('Worker Error: Result is not an array');
  }

  const processedItems = result.map(item => {
    const nemo_row = batchData.find(d => d.session_id === item.session_id && d.company_name === item.company_name);
    if (!nemo_row) return null;

    const { email, contact_recon, friction_type: nemo_friction_type } = normalizeNemoPayload(nemo_row.nemo_payload);
    const funding_signal = item.funding_signal ?? extractFundingSignal(nemo_row.nemo_payload);

    return {
      item,
      updateData: {
        email,
        contact_recon,
        nemo_friction_type,
        funding_signal
      }
    };
  }).filter(Boolean);

  parentPort.postMessage({ status: 'success', data: processedItems });
} catch (error) {
  parentPort.postMessage({ status: 'error', error: error.message });
}
