import { useState, useEffect } from 'react';

interface SlippageData {
  slippage: number;
  risk: 'low' | 'moderate' | 'severe';
  loading: boolean;
}

export const useSlippage = (token: string) => {
  const [data, setData] = useState<SlippageData>({ slippage: 0.1, risk: 'low', loading: true });

  useEffect(() => {
    // Simulated API response while waiting for backend
    const interval = setInterval(() => {
      const mockSlippage = parseFloat((Math.random() * 3).toFixed(2));
      let risk: 'low' | 'moderate' | 'severe' = 'low';
      if (mockSlippage > 0.5) risk = 'moderate';
      if (mockSlippage > 1.5) risk = 'severe';

      setData({ slippage: mockSlippage, risk, loading: false });
    }, 3000);

    return () => clearInterval(interval);
  }, [token]);

  return data;
};