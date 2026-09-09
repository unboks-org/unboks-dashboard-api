import {defineConfig,mergeConfig} from 'vite';
import path from 'node:path';
import base from '../vite.config';
export default defineConfig(async env=>{const config=await (base as any)(env);return mergeConfig(config,{envDir:false,resolve:{alias:[{find:'@/components/inbox/DashboardShell',replacement:path.resolve(import.meta.dirname,'isluno-operations-shell.tsx')},{find:'@',replacement:path.resolve(import.meta.dirname,'../src')}]},server:{host:'127.0.0.1',proxy:{'/api':{target:'http://127.0.0.1:8788',changeOrigin:true,secure:false}}}});});
