import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Home from "@/pages/Home";
import Gallery from "@/pages/Gallery";
import Contact from "@/pages/Contact";
import Corporate from "@/pages/Corporate";
import Weddings from "@/pages/Weddings";
import Testimonials from "@/pages/Testimonials";
import Book from "@/pages/Book";
import Tour from "@/pages/Tour";
import NotFound from "@/pages/NotFound";

/** Scroll to top on every route change. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/events" element={<Corporate />} />
        <Route path="/corporate" element={<Corporate />} />
        <Route path="/weddings" element={<Weddings />} />
        <Route path="/wedding" element={<Weddings />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/testimonials" element={<Testimonials />} />
        <Route path="/book" element={<Book />} />
        <Route path="/tour" element={<Tour />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
