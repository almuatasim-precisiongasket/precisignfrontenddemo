import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  FileText,
  CreditCard,
  Monitor,
  Laptop,
  FileCheck,
  ArrowRight,
  Sliders,
  CheckCircle2,
  Clock,
  Building,
  Info,
} from 'lucide-react';

interface FormCatalogItem {
  id: string;
  code: string;
  name: string;
  department: string;
  description: string;
  status: 'Prototype Active' | 'Catalog Spec';
  turnaround: string;
  stagesCount: number;
  icon: React.ComponentType<{ className?: string }>;
  isReady: boolean;
}

export const FormsLibraryView: React.FC = () => {
  const { setSelectedRequestFormType, setActiveView, selectedCompany } = useApp();
  const [selectedFormForDetails, setSelectedFormForDetails] = useState<FormCatalogItem | null>(null);

  const FORMS: FormCatalogItem[] = [
    {
      id: 'admin-work-request',
      code: 'PR#21-001FA',
      name: 'Admin Work Request Form',
      department: 'Administration / HR / Government Relations',
      description:
        'Official company request form covering Chamber of Commerce attestations, Ajeer contracts, salary certificates, work visit visas, agency wakala, and administrative procedures.',
      status: 'Prototype Active',
      turnaround: 'Urgent <1 hr · Medium 3 days · Low 7 days',
      stagesCount: 2,
      icon: FileText,
      isReady: true,
    },
    {
      id: 'payment-request',
      code: 'PR#21-002FA',
      name: 'Payment Request Form',
      department: 'Finance & Accounts',
      description:
        'Requisitions for vendor disbursement, advance payments, contractor milestones, and petty cash settlements with line-item tax and invoice matching.',
      status: 'Catalog Spec',
      turnaround: '5 business days',
      stagesCount: 3,
      icon: CreditCard,
      isReady: false,
    },
    {
      id: 'it-service-request',
      code: 'PR#21-003IT',
      name: 'IT Service & Systems Request',
      department: 'Information Technology',
      description:
        'Provisioning for corporate ERP accounts, network access permissions, mailbox creation, VPN endpoints, and software licensing allocations.',
      status: 'Catalog Spec',
      turnaround: '24–48 hours',
      stagesCount: 2,
      icon: Monitor,
      isReady: false,
    },
    {
      id: 'it-asset-allocation',
      code: 'PR#21-004AA',
      name: 'IT Asset Allocation Form',
      department: 'IT & Asset Custody',
      description:
        'Hardware issuance log (laptops, mobile workstations, monitors, peripherals) with serial barcode verification and employee custody acknowledgment.',
      status: 'Catalog Spec',
      turnaround: '2 business days',
      stagesCount: 2,
      icon: Laptop,
      isReady: false,
    },
    {
      id: 'undertaking-guarantee',
      code: 'PR#21-005UG',
      name: 'Undertaking & Guarantee Letter',
      department: 'Legal & Corporate Management',
      description:
        'Corporate undertakings, bank guarantee applications, corporate indemnities, and official government department commitment letters.',
      status: 'Catalog Spec',
      turnaround: 'Director sign-off: 3–5 days',
      stagesCount: 2,
      icon: FileCheck,
      isReady: false,
    },
  ];

  const handleLaunch = (form: FormCatalogItem) => {
    if (form.isReady) {
      setSelectedRequestFormType('Admin Work Request');
      setActiveView('create-request');
    } else {
      setSelectedFormForDetails(form);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2E5E9]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[#192B3C]">
              Forms &amp; Document Catalog
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#EBF2F7] text-[#365C78] border border-[#C2D5E3]">
              {selectedCompany.code}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Choose a company form to get started.
          </p>
        </div>

        <button
          onClick={() => setActiveView('workflow-settings')}
          className="flex items-center gap-2 px-3.5 py-2 border border-[#CBD5E1] bg-white hover:bg-[#F5F6F8] text-[#192B3C] rounded-md text-xs font-semibold shadow-xs transition-colors shrink-0"
        >
          <Sliders className="w-3.5 h-3.5 text-[#365C78]" />
          <span>Configure Workflows</span>
        </button>
      </div>

      {/* Catalog Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {FORMS.map((form) => {
          const IconComponent = form.icon;
          return (
            <div
              key={form.id}
              className={`bg-white border rounded-lg p-5 flex flex-col justify-between transition-shadow hover:shadow-sm ${
                form.isReady
                  ? 'border-[#365C78] ring-1 ring-[#365C78]/20'
                  : 'border-[#E2E5E9]'
              }`}
            >
              <div>
                {/* Top Badge & Code */}
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#E2E5E9]">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded flex items-center justify-center ${form.isReady ? 'bg-[#EBF2F7] text-[#365C78]' : 'bg-slate-100 text-slate-600'}`}>
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-mono text-[11px] font-bold text-[#192B3C]">
                        {form.code}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                      form.isReady
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    {form.status}
                  </span>
                </div>

                {/* Title & Description */}
                <div className="mt-3">
                  <h3 className="text-sm font-bold text-[#192B3C] flex items-baseline justify-between">
                    <span>{form.name}</span>
                  </h3>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    {form.description}
                  </p>
                </div>

                {/* Specs */}
                <div className="mt-4 pt-3 border-t border-[#E2E5E9] space-y-1.5 text-[11px] text-slate-500">
                  <div className="flex items-center justify-between">
                    <span>Department:</span>
                    <span className="font-medium text-slate-700">{form.department}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Target Turnaround:</span>
                    <span className="font-medium text-slate-700">{form.turnaround}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Routing Stages:</span>
                    <span className="font-medium text-slate-700">{form.isReady ? `${form.stagesCount} Approval Levels` : 'To be confirmed'}</span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-5 pt-3 border-t border-[#E2E5E9] flex items-center justify-between">
                {form.isReady ? (
                  <button
                    onClick={() => handleLaunch(form)}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-[#365C78] hover:bg-[#2A4A62] text-white rounded-md text-xs font-semibold transition-colors shadow-xs"
                  >
                    <span>Launch Request Form</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => handleLaunch(form)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-[#F5F6F8] hover:bg-slate-200 text-slate-700 border border-[#E2E5E9] rounded-md text-xs font-medium transition-colors"
                  >
                    <Info className="w-3 h-3 text-slate-500" />
                    <span>View Specifications</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Catalog Spec Modal */}
      {selectedFormForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg border border-[#E2E5E9] shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold text-[#365C78] bg-[#EBF2F7] px-1.5 py-0.5 rounded border border-[#C2D5E3]">
                  {selectedFormForDetails.code}
                </span>
                <h3 className="text-base font-bold text-[#192B3C] mt-1">
                  {selectedFormForDetails.name}
                </h3>
              </div>
              <span className="text-xs px-2 py-0.5 rounded border bg-slate-100 text-slate-700 border-slate-200">
                Specification Catalog
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {selectedFormForDetails.description}
            </p>

            <div className="bg-[#F5F6F8] p-3 rounded border border-[#E2E5E9] text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Department:</span>
                <span className="font-semibold text-slate-800">{selectedFormForDetails.department}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Target Turnaround:</span>
                <span className="font-semibold text-slate-800">{selectedFormForDetails.turnaround}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Default Workflow:</span>
                <span className="font-semibold text-slate-800">To be confirmed</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 italic">
              Note: The live document engine in this version is bound to the official <strong>Admin Work Request Form (PR#21-001FA)</strong>. Additional catalog forms can be customized in Workflow Administration.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E5E9]">
              <button
                onClick={() => setSelectedFormForDetails(null)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-md"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setSelectedFormForDetails(null);
                  setSelectedRequestFormType('Admin Work Request');
                  setActiveView('create-request');
                }}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-[#365C78] hover:bg-[#2A4A62] rounded-md shadow-xs"
              >
                Launch Admin Work Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
