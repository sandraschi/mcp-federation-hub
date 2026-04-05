import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';

// Components
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import Missions from './pages/Missions';  // now = Config
import Servers from './pages/Servers';
import Categories from './pages/Categories';
import Health from './pages/Health';
import Apps from './pages/Apps';
import Security from './pages/Security';
import Intelligence from './pages/Intelligence';  // now = LocalAI
import Tools from './pages/Tools';
import Worlds from './pages/Worlds';  // now = Logs
import Peers from './pages/Peers';
import PortMap from './pages/PortMap';

// Styles
import './index.css';

const queryClient = new QueryClient();

const PageWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 10, filter: 'blur(10px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0)' }}
        exit={{ opacity: 0, y: -10, filter: 'blur(10px)' }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="h-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};

function App() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <div className="h-screen w-full flex flex-col bg-[#020204] text-slate-100 font-inter select-none overflow-hidden antialiased">
          <Header isSidebarCollapsed={isSidebarCollapsed} />

          <div className="flex flex-1 overflow-hidden relative">
            <Sidebar
              isCollapsed={isSidebarCollapsed}
              onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            />

            <main className="flex-1 overflow-y-auto custom-scrollbar relative">
              <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-blue-500/[0.02] to-transparent pointer-events-none" />
              <div className="p-8 max-w-[1600px] mx-auto">
                <PageWrapper>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/missions" element={<Missions />} />
                    <Route path="/servers" element={<Servers />} />
                    <Route path="/peers" element={<Peers />} />
                    <Route path="/categories" element={<Categories />} />
                    <Route path="/health" element={<Health />} />
                    <Route path="/apps" element={<Apps />} />
                    <Route path="/security" element={<Security />} />
                    <Route path="/intelligence" element={<Intelligence />} />
                    <Route path="/tools" element={<Tools />} />
                    <Route path="/worlds" element={<Worlds />} />
                    <Route path="/portmap" element={<PortMap />} />
                  </Routes>
                </PageWrapper>
              </div>
            </main>
          </div>
        </div>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#0a0a0f',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(10px)',
            },
          }}
        />
      </Router>
    </QueryClientProvider>
  );
}

export default App;
