import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useState } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { DraftBanner } from './components/DraftBanner';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { ActiveSectionContext } from './lib/sections';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import ProjectDetail from './pages/ProjectDetail';
import WorkIndex from './pages/WorkIndex';

export default function App() {
  const location = useLocation();
  const [active, setActive] = useState<string | null>(null);

  return (
    <MotionConfig reducedMotion="user">
      <div id="top">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-accent focus:px-4 focus:py-2 focus:font-semibold focus:text-ink"
        >
          본문으로 건너뛰기
        </a>
        <DraftBanner />
        <Header active={active} />
        <ActiveSectionContext.Provider value={setActive}>
          {/* 페이지 전환: 이전 화면이 사라진 뒤 다음 화면이 올라온다 */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.main
              id="main"
              key={location.pathname}
              tabIndex={-1}
              className="outline-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <Routes location={location}>
                <Route path="/" element={<Home />} />
                <Route path="/work" element={<WorkIndex />} />
                <Route path="/work/:slug" element={<ProjectDetail />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </motion.main>
          </AnimatePresence>
        </ActiveSectionContext.Provider>
        <Footer />
      </div>
    </MotionConfig>
  );
}
