import React from 'react';
import { AdminWorkFormData } from '../../types/index';

interface DocumentProps {
  data: AdminWorkFormData;
  isPrintMode?: boolean;
}

export const AdminWorkRequestDocument: React.FC<DocumentProps> = ({
  data,
  isPrintMode = false,
}) => {
  const isSignedByRequester = Boolean(
    data.requesterSignatureDataUrl || (data.requesterSignatureDate && data.requesterSignatureName)
  );
  const isSignedByAuthority = Boolean(
    data.approvalAuthoritySignatureDataUrl ||
      (data.approvalAuthoritySignatureDate && data.approvalAuthoritySignatureName)
  );

  const workDesc = (data.workDescription || '').trim();
  const isLongDescription = workDesc.length > 450;

  // Split description if long for continuation page
  const descPart1 = isLongDescription
    ? `${workDesc.slice(0, 420)}...`
    : workDesc;
  const descPart2 = isLongDescription ? workDesc.slice(420) : '';

  return (
    <div
      className={`admin-work-document bg-white text-black font-sans box-border mx-auto transition-all ${
        isPrintMode
          ? 'w-full max-w-[190mm] shadow-none border-none p-0'
          : 'w-full max-w-[760px] p-6 sm:p-8 border border-neutral-300 shadow-sm'
      }`}
      style={{
        fontFamily: "'Cairo', 'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      {/* ==================== PAGE 1 ==================== */}
      <div className="border-[2px] border-black p-3.5 flex flex-col justify-between min-h-[940px] bg-white box-border avoid-page-break">
        <div>
          {/* Header: Logo + Company Title */}
          <div className="flex items-start justify-between border-b-[2px] border-black pb-3">
            {/* Precision Official Logo */}
            <div className="w-16 h-16 shrink-0 flex items-center justify-start">
              <img
                src="/assets/aistudio/precision-logo_e56c0764.png"
                alt="Precision Engineering Group Logo"
                className="h-13 w-auto max-w-[56px] object-contain"
                loading="eager"
              />
            </div>

            {/* Central Bilingual Titles */}
            <div className="flex-1 text-center px-4">
              <h1 className="text-xl font-extrabold tracking-wide text-black uppercase">
                PRECISION ENGINEERING GROUP
              </h1>
              <div className="flex items-center justify-center gap-2 mt-1 text-sm font-bold text-black">
                <span>Admin Work Request Form</span>
                <span>|</span>
                <span dir="rtl" className="font-bold">استمارة العمل الإداري</span>
              </div>
            </div>

            {/* Placeholder for header symmetry */}
            <div className="w-16 h-16 shrink-0" />
          </div>

          {/* Table 1: Date & Company, Requester & Department */}
          <div className="border-b-[2px] border-black text-xs">
            <div className="grid grid-cols-2 border-b border-black">
              {/* Date of Request */}
              <div className="p-2 border-r border-black">
                <div className="flex justify-between items-baseline font-bold">
                  <span>Date of Request:</span>
                  <span dir="rtl">تاريخ الطلب</span>
                </div>
                <div className="mt-1 font-semibold text-sm min-h-[20px] text-neutral-900 truncate">
                  {data.dateOfRequest || '—'}
                </div>
              </div>

              {/* Company */}
              <div className="p-2 min-w-0">
                <div className="font-bold">Company:</div>
                <div className="mt-1 font-semibold text-sm min-h-[20px] text-neutral-900 truncate">
                  {data.companyName || 'PEW - Precision Engineering Works'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2">
              {/* Name of Requester */}
              <div className="p-2 border-r border-black min-w-0">
                <div className="flex justify-between items-baseline font-bold">
                  <span>Name of the Requester:</span>
                  <span dir="rtl">اسم صاحب الطلب</span>
                </div>
                <div className="mt-1 font-semibold text-sm min-h-[20px] text-neutral-900 truncate">
                  {data.requesterName || data.requesterSignatureName || '—'}
                </div>
              </div>

              {/* Department */}
              <div className="p-2 min-w-0">
                <div className="font-bold">Department:</div>
                <div className="mt-1 font-semibold text-sm min-h-[20px] text-neutral-900 truncate">
                  {data.department || '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Priority Section */}
          <div className="border-b-[2px] border-black p-2 text-xs">
            <div className="flex items-baseline justify-between font-bold mb-1.5">
              <span>Priority:</span>
              <span dir="rtl">:أولوية</span>
            </div>
            <div className="flex items-center gap-6 mt-1 text-xs">
              <label className="flex items-center gap-1.5 cursor-default">
                <div
                  className={`w-4 h-4 border border-black flex items-center justify-center ${
                    data.priority === 'Urgent' ? 'bg-black text-white font-bold' : 'bg-white'
                  }`}
                >
                  {data.priority === 'Urgent' && <span className="text-xs leading-none">✓</span>}
                </div>
                <span className="font-semibold">Urgent</span>
                <span>|</span>
                <span dir="rtl">عاجل</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-default">
                <div
                  className={`w-4 h-4 border border-black flex items-center justify-center ${
                    data.priority === 'Medium' ? 'bg-black text-white font-bold' : 'bg-white'
                  }`}
                >
                  {data.priority === 'Medium' && <span className="text-xs leading-none">✓</span>}
                </div>
                <span className="font-semibold">Medium</span>
                <span>|</span>
                <span dir="rtl">متوسط</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-default">
                <div
                  className={`w-4 h-4 border border-black flex items-center justify-center ${
                    data.priority === 'Low' ? 'bg-black text-white font-bold' : 'bg-white'
                  }`}
                >
                  {data.priority === 'Low' && <span className="text-xs leading-none">✓</span>}
                </div>
                <span className="font-semibold">Low</span>
                <span>|</span>
                <span dir="rtl">منخفض</span>
              </label>
            </div>
          </div>

          {/* Work Description Section */}
          <div className="border-b-[2px] border-black p-2 min-h-[90px] text-xs">
            <div className="flex items-baseline justify-between font-bold mb-1">
              <span>Work Description:</span>
              <span dir="rtl">:المسمى الوظيفي</span>
            </div>
            <div className="whitespace-pre-wrap break-words font-medium text-xs leading-relaxed text-neutral-900 pl-1 pt-1 min-h-[50px]">
              {descPart1 || '—'}
            </div>
            {isLongDescription && (
              <div className="text-[10px] font-bold text-purple-700 italic pt-1 text-right">
                [Full detailed description continued on Sheet 2]
              </div>
            )}
          </div>

          {/* Documents Checklist Section */}
          <div className="border-b-[2px] border-black p-2 text-xs">
            <div className="font-bold text-xs mb-1.5">Documents:</div>
            <div className="space-y-1 pl-2">
              {/* Item 1 */}
              <div className="flex items-center justify-between py-0.5">
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <span className="w-4 shrink-0">1.</span>
                  <span className="font-medium truncate">Online Document Chamber</span>
                  <span className="text-neutral-400">|</span>
                  <span dir="rtl" className="text-neutral-800 shrink-0">غرفة التوثيق عبر الإنترنت</span>
                </div>
                <div
                  className={`w-4 h-4 border border-black flex items-center justify-center mr-2 shrink-0 ${
                    data.documents?.onlineDocumentChamber ? 'bg-black text-white' : 'bg-white'
                  }`}
                >
                  {data.documents?.onlineDocumentChamber && <span className="text-xs font-bold leading-none">✓</span>}
                </div>
              </div>

              {/* Item 2 */}
              <div className="flex items-center justify-between py-0.5">
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <span className="w-4 shrink-0">2.</span>
                  <span className="font-medium truncate">Physical Document Chamber</span>
                  <span className="text-neutral-400">|</span>
                  <span dir="rtl" className="text-neutral-800 shrink-0">غرفة الوثائق المادية</span>
                </div>
                <div
                  className={`w-4 h-4 border border-black flex items-center justify-center mr-2 shrink-0 ${
                    data.documents?.physicalDocumentChamber ? 'bg-black text-white' : 'bg-white'
                  }`}
                >
                  {data.documents?.physicalDocumentChamber && <span className="text-xs font-bold leading-none">✓</span>}
                </div>
              </div>

              {/* Item 3 */}
              <div className="flex items-center justify-between py-0.5">
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <span className="w-4 shrink-0">3.</span>
                  <span className="font-medium truncate">Company document Ajeer</span>
                  <span className="text-neutral-400">|</span>
                  <span dir="rtl" className="text-neutral-800 shrink-0">وثيقة شركة أجير</span>
                </div>
                <div
                  className={`w-4 h-4 border border-black flex items-center justify-center mr-2 shrink-0 ${
                    data.documents?.companyDocumentAjeer ? 'bg-black text-white' : 'bg-white'
                  }`}
                >
                  {data.documents?.companyDocumentAjeer && <span className="text-xs font-bold leading-none">✓</span>}
                </div>
              </div>

              {/* Item 4 */}
              <div className="flex items-center justify-between py-0.5">
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <span className="w-4 shrink-0">4.</span>
                  <span className="font-medium truncate">Employee Salary Certificate</span>
                  <span className="text-neutral-400">|</span>
                  <span dir="rtl" className="text-neutral-800 shrink-0">شهادة راتب الموظف</span>
                </div>
                <div
                  className={`w-4 h-4 border border-black flex items-center justify-center mr-2 shrink-0 ${
                    data.documents?.employeeSalaryCertificate ? 'bg-black text-white' : 'bg-white'
                  }`}
                >
                  {data.documents?.employeeSalaryCertificate && <span className="text-xs font-bold leading-none">✓</span>}
                </div>
              </div>

              {/* Item 5 */}
              <div className="flex items-center justify-between py-0.5">
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <span className="w-4 shrink-0">5.</span>
                  <span className="font-medium truncate">Permanent Employment Visa</span>
                  <span className="text-neutral-400">|</span>
                  <span dir="rtl" className="text-neutral-800 shrink-0">تأشيرة عمل دائمة</span>
                </div>
                <div
                  className={`w-4 h-4 border border-black flex items-center justify-center mr-2 shrink-0 ${
                    data.documents?.permanentEmploymentVisa ? 'bg-black text-white' : 'bg-white'
                  }`}
                >
                  {data.documents?.permanentEmploymentVisa && <span className="text-xs font-bold leading-none">✓</span>}
                </div>
              </div>

              {/* Item 6 */}
              <div className="flex items-center justify-between py-0.5">
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <span className="w-4 shrink-0">6.</span>
                  <span className="font-medium truncate">Work Visit Visa</span>
                  <span className="text-neutral-400">|</span>
                  <span dir="rtl" className="text-neutral-800 shrink-0">تأشيرة زيارة عمل</span>
                </div>
                <div
                  className={`w-4 h-4 border border-black flex items-center justify-center mr-2 shrink-0 ${
                    data.documents?.workVisitVisa ? 'bg-black text-white' : 'bg-white'
                  }`}
                >
                  {data.documents?.workVisitVisa && <span className="text-xs font-bold leading-none">✓</span>}
                </div>
              </div>

              {/* Item 7 */}
              <div className="flex items-center justify-between py-0.5">
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <span className="w-4 shrink-0">7.</span>
                  <span className="font-medium truncate">Business Visit Visa</span>
                  <span className="text-neutral-400">|</span>
                  <span dir="rtl" className="text-neutral-800 shrink-0">تأشيرة زيارة عمل</span>
                </div>
                <div
                  className={`w-4 h-4 border border-black flex items-center justify-center mr-2 shrink-0 ${
                    data.documents?.businessVisitVisa ? 'bg-black text-white' : 'bg-white'
                  }`}
                >
                  {data.documents?.businessVisitVisa && <span className="text-xs font-bold leading-none">✓</span>}
                </div>
              </div>

              {/* Item 8 */}
              <div className="flex items-center justify-between py-0.5">
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <span className="w-4 shrink-0">8.</span>
                  <span className="font-medium truncate">Agency Wakala</span>
                  <span className="text-neutral-400">|</span>
                  <span dir="rtl" className="text-neutral-800 shrink-0">الوكالة</span>
                </div>
                <div
                  className={`w-4 h-4 border border-black flex items-center justify-center mr-2 shrink-0 ${
                    data.documents?.agencyWakala ? 'bg-black text-white' : 'bg-white'
                  }`}
                >
                  {data.documents?.agencyWakala && <span className="text-xs font-bold leading-none">✓</span>}
                </div>
              </div>

              {/* Item 9 Others */}
              <div className="flex items-center justify-between py-0.5">
                <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                  <span className="w-4 shrink-0">9.</span>
                  <span className="font-medium shrink-0">Others:</span>
                  <span className="border-b border-black flex-1 text-xs font-medium px-1 truncate">
                    {data.documents?.othersDescription || (data.documents?.others ? 'Specified' : '')}
                  </span>
                </div>
                <div
                  className={`w-4 h-4 border border-black flex items-center justify-center mr-2 shrink-0 ${
                    data.documents?.others ? 'bg-black text-white' : 'bg-white'
                  }`}
                >
                  {data.documents?.others && <span className="text-xs font-bold leading-none">✓</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Signatures Area */}
          <div className="border-b-[2px] border-black text-xs avoid-page-break">
            <div className="grid grid-cols-2">
              {/* Requester Signature Box */}
              <div className="p-2 border-r border-black min-h-[90px] flex flex-col justify-between min-w-0">
                <div className="flex justify-between items-baseline font-bold">
                  <span>Requester Signature</span>
                  <span dir="rtl">:طلب التوقيع</span>
                </div>

                {/* Signature presentation: gate by isSignedByRequester */}
                <div className="my-2 h-10 flex items-center justify-start pl-4">
                  {data.requesterSignatureDataUrl ? (
                    <img
                      src={data.requesterSignatureDataUrl}
                      alt="Requester Signature"
                      className="max-h-10 max-w-[140px] object-contain"
                    />
                  ) : isSignedByRequester && data.requesterSignatureName ? (
                    <div
                      className="text-blue-700 text-2xl font-bold tracking-wider italic select-none"
                      style={{ fontFamily: "'Caveat', cursive" }}
                    >
                      {data.requesterSignatureName}
                    </div>
                  ) : (
                    <div className="text-neutral-400 text-xs italic select-none">
                      (Signature required upon submission)
                    </div>
                  )}
                </div>

                <div className="flex items-baseline gap-2 pt-1 min-w-0">
                  <span className="font-bold shrink-0">Name:</span>
                  <span className="border-b border-black flex-1 font-semibold pl-1 truncate">
                    {data.requesterSignatureName || data.requesterName || ''}
                  </span>
                </div>
              </div>

              {/* Approval Authority Signature Box */}
              <div className="p-2 min-h-[90px] flex flex-col justify-between min-w-0">
                <div className="flex justify-between items-baseline font-bold">
                  <span>Approval Authority Signature</span>
                  <span dir="rtl">سلطة الموافقة للتوقيع</span>
                </div>

                {/* Signature presentation */}
                <div className="my-2 h-10 flex items-center justify-start pl-4">
                  {data.approvalAuthoritySignatureDataUrl ? (
                    <img
                      src={data.approvalAuthoritySignatureDataUrl}
                      alt="Approval Authority Signature"
                      className="max-h-10 max-w-[140px] object-contain"
                    />
                  ) : isSignedByAuthority && data.approvalAuthoritySignatureName ? (
                    <div
                      className="text-blue-800 text-2xl font-bold tracking-wider italic select-none"
                      style={{ fontFamily: "'Caveat', cursive" }}
                    >
                      {data.approvalAuthoritySignatureName}
                    </div>
                  ) : (
                    <div className="text-neutral-400 text-xs italic select-none">
                      Pending Final Authority Approval
                    </div>
                  )}
                </div>

                <div className="flex items-baseline gap-2 pt-1 min-w-0">
                  <span className="font-bold shrink-0">Name:</span>
                  <span className="border-b border-black flex-1 font-semibold pl-1 truncate">
                    {data.approvalAuthoritySignatureName || ''}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes Section */}
          <div className="border-b-[2px] border-black p-2 text-[10px] leading-tight avoid-page-break">
            <div className="font-bold text-xs mb-1">Notes:</div>
            <ol className="space-y-1.5 pl-2">
              <li className="flex flex-col">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">1. Urgent Priority Document/Work will be process in same hour/immediately</span>
                  <span className="text-neutral-400 mx-1">|</span>
                  <span dir="rtl" className="text-neutral-800">ستتم معالجة وثيقة الأولوية العاجلة /</span>
                </div>
                <div dir="rtl" className="text-neutral-800 font-normal pr-4">
                  العمل في نفس الساعة / على الفور
                </div>
              </li>

              <li className="flex items-baseline justify-between">
                <span className="font-medium">2. Medium Priority Document/Work will process with 3 days</span>
                <span className="text-neutral-400 mx-1">|</span>
                <span dir="rtl" className="text-neutral-800">ستتم معالجة المستند / العمل ذي الأولوية المتوسطة في غضون 3 أيام</span>
              </li>

              <li className="flex items-baseline justify-between">
                <span className="font-medium">3. Low Priority Document/Work will process within 7 days</span>
                <span className="text-neutral-400 mx-1">|</span>
                <span dir="rtl" className="text-neutral-800">ستتم معالجة المستند / العمل ذو الأولوية المنخفضة في غضون 7 أيام</span>
              </li>
            </ol>
          </div>

          {/* Admin Team Use Only Section */}
          <div className="p-2 text-[11px] leading-snug avoid-page-break">
            <div className="text-center font-bold text-[10px] tracking-wider mb-2 text-neutral-800">
              --------------------------- ADMIN TEAM USE ONLY | استخدام فريق المشرف فقط ---------------------------
            </div>

            <div className="space-y-1.5 pl-1">
              {/* Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold">
                  <span>• Work Completion Status</span>
                  <span>|</span>
                  <span dir="rtl">حالة إنجاز العمل :</span>
                </div>
                <div className="flex items-center gap-4 mr-2">
                  <label className="flex items-center gap-1">
                    <span>Completed</span>
                    <div
                      className={`w-3.5 h-3.5 border border-black flex items-center justify-center ${
                        data.adminUseOnly?.status === 'Completed' ? 'bg-black text-white font-bold' : ''
                      }`}
                    >
                      {data.adminUseOnly?.status === 'Completed' && '✓'}
                    </div>
                  </label>
                  <label className="flex items-center gap-1">
                    <span>Pending</span>
                    <div
                      className={`w-3.5 h-3.5 border border-black flex items-center justify-center ${
                        data.adminUseOnly?.status === 'Pending' ? 'bg-black text-white font-bold' : ''
                      }`}
                    >
                      {data.adminUseOnly?.status === 'Pending' && '✓'}
                    </div>
                  </label>
                </div>
              </div>

              {/* Completion Date */}
              <div className="flex items-center">
                <span className="font-bold shrink-0">• Work Completion Date</span>
                <span className="mx-1 shrink-0">|</span>
                <span dir="rtl" className="font-bold shrink-0">تاريخ إتمام العمل :</span>
                <span className="border-b border-black flex-1 ml-2 font-medium px-2 truncate">
                  {data.adminUseOnly?.completionDate || ''}
                </span>
              </div>

              {/* Completed By Name */}
              <div className="flex items-center">
                <span className="font-bold shrink-0">• Work Completed By Name</span>
                <span className="mx-1 shrink-0">|</span>
                <span dir="rtl" className="font-bold shrink-0">اكتمل العمل بالاسم :</span>
                <span className="border-b border-black flex-1 ml-2 font-medium px-2 truncate">
                  {data.adminUseOnly?.completedByName || ''}
                </span>
              </div>

              {/* Portal info */}
              <div className="flex items-center">
                <span className="font-bold shrink-0">• Portal - Labour Office, Muqueem, Qiwa, Gosi</span>
                <span className="mx-1 shrink-0">|</span>
                <span dir="rtl" className="font-bold shrink-0">البوابة - العمل ، مقيم ، قوى ، التأميني :</span>
                <span className="border-b border-black flex-1 ml-2 font-medium px-2" />
              </div>
            </div>
          </div>
        </div>

        {/* Format Code Footer */}
        <div className="text-right text-[10px] font-bold tracking-tight text-neutral-800 pt-1 border-t border-neutral-300">
          Format Code# PR#21-001FA {isLongDescription ? '(Sheet 1 of 2)' : ''}
        </div>
      </div>

      {/* ==================== PAGE 2: CONTINUATION SHEET (When description is long) ==================== */}
      {isLongDescription && (
        <div className="mt-6 border-[2px] border-black p-3.5 flex flex-col justify-between min-h-[940px] bg-white box-border page-break-before avoid-page-break">
          <div>
            {/* Header: Logo + Company Title */}
            <div className="flex items-start justify-between border-b-[2px] border-black pb-3">
              <div className="w-16 h-16 shrink-0 flex items-center justify-start">
                <img
                  src="/assets/aistudio/precision-logo_e56c0764.png"
                  alt="Precision Engineering Group Logo"
                  className="h-13 w-auto max-w-[56px] object-contain"
                  loading="eager"
                />
              </div>

              <div className="flex-1 text-center px-4">
                <h1 className="text-lg font-extrabold tracking-wide text-black uppercase">
                  PRECISION ENGINEERING GROUP
                </h1>
                <div className="flex items-center justify-center gap-2 mt-1 text-xs font-bold text-black">
                  <span>Admin Work Request — Continuation Sheet</span>
                  <span>|</span>
                  <span dir="rtl" className="font-bold">استمارة العمل الإداري - ورقة متابعة</span>
                </div>
              </div>

              <div className="w-16 h-16 shrink-0" />
            </div>

            {/* Reference Bar */}
            <div className="grid grid-cols-4 border-b border-black text-xs p-2 bg-neutral-50 font-medium">
              <div>
                <span className="font-bold">Date: </span>
                <span>{data.dateOfRequest || '—'}</span>
              </div>
              <div>
                <span className="font-bold">Requester: </span>
                <span className="truncate">{data.requesterName || '—'}</span>
              </div>
              <div>
                <span className="font-bold">Company: </span>
                <span className="truncate">{data.companyName || 'PEW'}</span>
              </div>
              <div>
                <span className="font-bold">Dept: </span>
                <span>{data.department || '—'}</span>
              </div>
            </div>

            {/* Full Continued Description Content */}
            <div className="p-4 space-y-4">
              <div className="font-bold text-xs border-b border-black pb-1">
                Extended Work Scope &amp; Specification (Continued):
              </div>
              <div className="whitespace-pre-wrap break-words font-medium text-xs leading-relaxed text-neutral-900 min-h-[400px]">
                {descPart2}
              </div>
            </div>

            {/* Verification Signatures Box on Continuation Sheet */}
            <div className="border border-black p-3 text-xs mt-6">
              <div className="font-bold text-xs mb-2">Continuation Sheet Certification:</div>
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-neutral-300 p-2 rounded">
                  <div className="font-bold text-[11px]">Requester Sign-off:</div>
                  <div className="my-1 text-xs font-semibold">{data.requesterName}</div>
                  <div className="text-[10px] text-neutral-500">
                    {data.requesterSignatureDate
                      ? `Signed on: ${new Date(data.requesterSignatureDate).toLocaleDateString()}`
                      : 'Pending Submission'}
                  </div>
                </div>

                <div className="border border-neutral-300 p-2 rounded">
                  <div className="font-bold text-[11px]">Authority Sign-off:</div>
                  <div className="my-1 text-xs font-semibold">
                    {data.approvalAuthoritySignatureName || 'Pending Final Approval'}
                  </div>
                  <div className="text-[10px] text-neutral-500">
                    {data.approvalAuthoritySignatureDate
                      ? `Approved on: ${new Date(data.approvalAuthoritySignatureDate).toLocaleDateString()}`
                      : 'Pending Review'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="text-right text-[10px] font-bold tracking-tight text-neutral-800 pt-1 border-t border-neutral-300">
            Format Code# PR#21-001FA (Sheet 2 of 2)
          </div>
        </div>
      )}
    </div>
  );
};

