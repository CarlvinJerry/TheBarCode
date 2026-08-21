import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),VitePWA({registerType:'autoUpdate',manifest:{name:'TheBarcode POS',short_name:'TheBarcode',description:'Offline-first café and bar point of sale',theme_color:'#173e35',background_color:'#f5f7f5',display:'standalone',start_url:'/'},workbox:{globPatterns:['**/*.{js,css,html,png,svg,ico}']}})],
})
