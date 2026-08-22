import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),VitePWA({registerType:'autoUpdate',manifest:{name:'Dukora — Smarter Business Operations',short_name:'Dukora',description:'Offline-first point of sale and business operations platform',theme_color:'#07101e',background_color:'#07101e',display:'standalone',start_url:'/',icons:[{src:'/dukora-logo.png',sizes:'1280x1280',type:'image/png',purpose:'any maskable'}]},workbox:{globPatterns:['**/*.{js,css,html,png,svg,ico}']}})],
  server:{proxy:{'/api':'http://localhost:8088'}},
})
