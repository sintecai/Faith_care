import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get directory name that works in both ESM and CJS
function getDirname(): string {
  // Try ESM way first
  if (typeof import.meta !== 'undefined' && import.meta.url) {
    return path.dirname(fileURLToPath(import.meta.url));
  }
  // Fallback to CJS way
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  // Last resort: use process.cwd()
  return process.cwd();
}

export function serveStatic(app: Express) {
  // In production, serve from dist directory structure
  const distDir = getDirname();
  
  // Try to find public directory - first in same directory, then in server subdirectory
  let publicPath = path.resolve(distDir, "public");
  if (!fs.existsSync(publicPath)) {
    publicPath = path.resolve(distDir, "server", "public");
  }
  if (!fs.existsSync(publicPath)) {
    publicPath = path.resolve(process.cwd(), "server", "public");
  }
  
  if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
  }
  
  // For EJS, views should already be set up by routes.ts
  // This function is mainly for static assets in production
}
