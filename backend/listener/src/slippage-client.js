const { config } = require('./config');

async function analyzeTransaction(decodedTx) {
    const url = config.server.slippageApiUrl;

    if (!url) {
        return { ok: false, error: 'Missing SLIPPAGE_API_URL configuration.' };
    }

    if (typeof fetch !== 'function') {
        return { ok: false, error: 'Global fetch is not available in this Node version.' };
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(decodedTx)
        });

        const contentType = response.headers.get('content-type') || '';
        const payload = contentType.includes('application/json')
            ? await response.json()
            : await response.text();

        if (!response.ok) {
            return { ok: false, status: response.status, error: payload };
        }

        return { ok: true, status: response.status, data: payload };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

module.exports = {
    analyzeTransaction
};
