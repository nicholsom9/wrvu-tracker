import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Set base to your GitHub Pages repo name, e.g. '/wrvu-tracker/'.
// Using '/' breaks asset paths on Pages unless the repo is a user/org root page.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
});
