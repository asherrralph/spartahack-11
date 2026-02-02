import { createBrowserRouter } from 'react-router-dom';
import Layout from '../components/Layout';
import BestPractices from '../pages/best-practices';
import Information from '../pages/information';
import SlippageEstimates from '../pages/slippage-estimates';

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { path: "best-practices", element: <BestPractices /> },
      { path: "information", element: <Information /> },
      { path: "slippage-estimates", element: <SlippageEstimates /> },
    ],
  },
]);