// Local verification entry only: synthetic token and isolated backend fixture.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MermaidTripSettings} from '../src/components/settings/MermaidTripSettings';
import '../src/index.css';
sessionStorage.setItem('unboks_active_tenant','mermaid');
localStorage.setItem('wtyj_token_mermaid','isluno-local-fixture-token');
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}})}><main className="mx-auto max-w-7xl p-4 sm:p-8"><MermaidTripSettings/></main></QueryClientProvider>);
