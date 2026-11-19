import React from 'react';

const CheckingSection = () => {
    return (
        <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Checking Section</h1>
            <p className="text-slate-500 text-sm mt-1">AOE Verification and Checking Section.</p>
            <div className="mt-8 text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl">
                <p className="text-slate-400 font-medium">No pending check tasks.</p>
            </div>
        </div>
    );
};

export default CheckingSection;
