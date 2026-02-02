import { Outlet, Link } from 'react-router-dom';

const Layout = () => {
  return (
    <div className="layout-container">
      <nav style={{ display: 'flex', gap: '20px', padding: '1rem', background: '#f0f0f0' }}>
        <Link to="/information">Info</Link>
        <Link to="/best-practices">Best Practices</Link>
        <Link to="/slippage-estimates">Slippage</Link>
      </nav>
      <main style={{ padding: '20px' }}>
        <Outlet /> {/* This is where your pages will render */}
      </main>
    </div>
  );
};

export default Layout;