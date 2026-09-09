// Only the surrounding dashboard chrome is replaced in this isolated fixture.
// Page components, router, capabilities, API clients and backend are real.
import type {ReactNode} from 'react';
export function DashboardShell({children,pageTitle,searchQuery,onSearchChange}:{children:ReactNode;pageTitle?:string;searchQuery?:string;onSearchChange?:(value:string)=>void}){return <div className="mx-auto max-w-7xl"><header className="border-b bg-white px-6 py-4"><h1 className="text-xl font-semibold">{pageTitle}</h1>{onSearchChange && <label className="mt-3 block text-sm">Search journeys or guests<input className="mt-1 block min-h-11 w-full rounded-lg border p-3" value={searchQuery} onChange={e=>onSearchChange(e.target.value)}/></label>}</header>{children}</div>;}
