import { defineConfig, mergeConfig } from 'vite';
import base from '../vite.config';
export default defineConfig(async env=>mergeConfig(await (base as any)(env),{envDir:false,server:{host:'127.0.0.1',proxy:{'/api':{target:'http://127.0.0.1:8788',changeOrigin:true,secure:false}}}}));
