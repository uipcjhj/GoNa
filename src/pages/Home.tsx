import { useContext } from 'react';
import { NAV } from '../components/Header';
import { ActiveSectionContext, useSectionSpy } from '../lib/sections';
import { usePage } from '../lib/usePage';
import { About } from '../sections/About';
import { Contact } from '../sections/Contact';
import { Hero } from '../sections/Hero';
import { Lab } from '../sections/Lab';
import { SelectedWork } from '../sections/SelectedWork';

const SECTION_IDS = NAV.map((n) => n.id);

export default function Home() {
  usePage();
  useSectionSpy(SECTION_IDS, useContext(ActiveSectionContext));
  return (
    <>
      <Hero />
      <SelectedWork />
      <Lab />
      <About />
      <Contact />
    </>
  );
}
