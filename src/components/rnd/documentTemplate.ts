// Static PR#26-RND01 document structure. Dynamic values are escaped in RndRequestDocument.
export const rndDocumentTemplate = `<section class="a4-sheet" aria-label="A4 Page 1">
      <div class="page-outer-frame">


        <header class="doc-header">
          <div class="brand-row">
            <div class="brand-logo-wrap">
              {{companyLogo}}

            </div>
            <div class="brand-title-block">
              <div class="company-name">{{companyName}}</div>
              <div class="form-main-title">R&amp;D INITIATIVE – PROBLEM IDENTIFICATION AND SUBMISSION FORM</div>
            </div>
          </div>
          <div class="purpose-box">
            <strong>Purpose:</strong> To identify operational, technical, commercial, quality, safety, and process-related challenges across Precision Group companies and evaluate opportunities for improvement and research.
          </div>
        </header>


        <div class="sec-banner first-banner">
          <span>A. Submission Details</span>
        </div>
        <table class="doc-table">
          <thead>
            <tr>
              <th style="width:34%;">Particular</th>
              <th style="width:66%;">Details</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="td-label">Submission Reference No.</td>
              <td><div class="doc-editable">{{outSubRef}}</div></td>
            </tr>
            <tr>
              <td class="td-label">Date of Submission</td>
              <td><div class="doc-editable">{{outSubDate}}</div></td>
            </tr>
            <tr>
              <td class="td-label">Company / Division</td>
              <td><div class="doc-editable">{{outCompany}}</div></td>
            </tr>
            <tr>
              <td class="td-label">Department</td>
              <td><div class="doc-editable">{{outDept}}</div></td>
            </tr>
            <tr>
              <td class="td-label">Employee Name &amp; Designation</td>
              <td><div class="doc-editable">{{outEmpName}}</div></td>
            </tr>
            <tr>
              <td class="td-label">Contact Details</td>
              <td><div class="doc-editable">{{outContact}}</div></td>
            </tr>
            <tr class="no-bottom-border">
              <td class="td-label">Problem Title</td>
              <td><div class="doc-editable" style="font-weight:700;">{{outProbTitle}}</div></td>
            </tr>
          </tbody>
        </table>


        <div class="sec-banner">
          <span>B. Problem Description</span>
        </div>


        <div class="q-block">
          <div class="q-title">1. Describe the problem or challenge.</div>
          <div class="q-sub">Explain what happens, where it occurs, and which process or activity is affected.</div>
          <div class="response-wrap">
            <span class="response-label">Response:</span>
            <div class="ruled-response-area doc-editable">{{outQ1}}</div>
          </div>
        </div>


        <div class="q-block">
          <div class="q-title">2. Describe an actual scenario or recent example.</div>
          <div class="q-sub">Include the circumstances and consequences of the problem.</div>
          <div class="response-wrap">
            <span class="response-label">Response:</span>
            <div class="ruled-response-area doc-editable">{{outQ2}}</div>
          </div>
        </div>


        <div class="q-block">
          <div class="q-title">3. How frequently does it occur, and is it recurring?</div>
          <div class="opt-flow" style="margin-top:0.25mm;">
            <strong style="font-size:8.1pt;">Frequency:</strong>
            <span class="opt-flow">{{docQ3Freq}}</span>
            <span class="inline-line-field doc-editable">{{outQ3FreqOther}}</span>
          </div>
          <div class="opt-flow" style="margin-top:0.4mm; justify-content:space-between;">
            <div class="opt-flow">
              <strong style="font-size:8.1pt;">Recurring?</strong>
              <span class="opt-flow">{{docQ3Rec}}</span>
            </div>
            <div class="opt-flow" style="flex:1; max-width:118mm;">
              <span>If recurring, approximate number of occurrences:</span>
              <span class="inline-line-field wide doc-editable">{{outQ3Occur}}</span>
            </div>
          </div>
        </div>


        <div class="q-block no-bottom">
          <div class="q-title">4. How long has the problem existed?</div>
          <div class="opt-flow" style="margin-top:0.25mm;">{{docQ4Dur}}</div>
        </div>


        <div class="sec-banner">
          <span>C. Business Impact</span>
        </div>


        <div class="q-block">
          <div class="q-title">5. What areas are affected? <span class="q-normal">(Select all applicable)</span></div>
          <div class="doc-chk-grid-3">{{docQ5Areas}}</div>
        </div>


        <div class="q-block no-bottom" style="padding:0.9mm 0 0 0;">
          <div class="q-title" style="padding:0 2.8mm 0.6mm;">6. Estimate the impact, wherever possible.</div>
          <table class="doc-table" style="border-top:var(--cell-border);">
            <thead>
              <tr>
                <th style="width:34%;">Impact Measure</th>
                <th style="width:66%;">Estimated Details</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="td-label">Time lost / frequency</td>
                <td><div class="doc-editable">{{outImpTime}}</div></td>
              </tr>
              <tr>
                <td class="td-label">Manpower involved</td>
                <td><div class="doc-editable">{{outImpManpower}}</div></td>
              </tr>
              <tr>
                <td class="td-label">Financial impact</td>
                <td><div class="doc-editable">{{outImpFinance}}</div></td>
              </tr>
              <tr>
                <td class="td-label">Production / delivery impact</td>
                <td><div class="doc-editable">{{outImpProd}}</div></td>
              </tr>
              <tr>
                <td class="td-label">Other measurable impact</td>
                <td><div class="doc-editable">{{outImpOther}}</div></td>
              </tr>
            </tbody>
          </table>
          <div class="table-footnote">Approximate figures or descriptions are acceptable.</div>
        </div>


        <div class="sec-banner">
          <span>D. Existing Solutions and Market Research</span>
        </div>


        <div class="q-block">
          <div class="q-title">7. How is the problem currently managed or addressed?</div>
          <div class="response-wrap">
            <span class="response-label">Response:</span>
            <div class="ruled-response-area single-line doc-editable">{{outQ7}}</div>
          </div>
        </div>


        <div class="q-block" style="padding-bottom:0;">
          <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:2mm;">
            <div class="q-title">8. Are ready-made solutions available in the market?</div>
            <div class="opt-flow">{{docQ8Mkt}}</div>
          </div>
          <div class="q-sub" style="margin-top:0.2mm;">If known, provide details:</div>
          <table class="doc-table" style="border-top:var(--cell-border); margin:0.5mm -2.8mm 0; width:calc(100% + 5.6mm);">
            <thead>
              <tr>
                <th style="width:36%;">Solution / Product</th>
                <th style="width:32%;">Supplier / Provider</th>
                <th style="width:32%;">Website / Reference</th>
              </tr>
            </thead>
            <tbody>{{docMktTableBody}}</tbody>
          </table>
        </div>


        <div class="q-block">
          <div class="q-title">9. If solutions exist, why are they not being adopted?</div>
          <div class="doc-chk-grid-3">{{docQ9Barriers}}</div>
          <div class="response-wrap" style="margin-top:0.25mm;">
            <span class="response-label">Explanation:</span>
            <div class="ruled-response-area single-line doc-editable">{{outQ9Exp}}</div>
          </div>
        </div>


        <div class="q-block no-bottom">
          <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:2mm;">
            <div class="q-title">10. Have previous solutions been attempted?</div>
            <div class="opt-flow">{{docQ10Prev}}</div>
          </div>
          <div class="response-wrap" style="margin-top:0.25mm;">
            <span class="response-label">If yes, explain what was tried and the outcome:</span>
            <div class="ruled-response-area single-line doc-editable">{{outQ10Exp}}</div>
          </div>
        </div>


        <div></div>

      </div>
      <div class="sheet-footer">
        <span>{{companyName}} — R&amp;D Initiative Form</span>
        <span>Page 1 of 2</span>
        <span class="footer-code">Format Code# PR#26-RND01</span>
      </div>
    </section>
<section class="a4-sheet" aria-label="A4 Page 2">
      <div class="page-outer-frame">


        <div class="page2-running-header">
          <div class="running-brand">
            {{companyLogo}}

            <span>{{companyName}} | R&amp;D Initiative – Problem Identification and Submission Form</span>
          </div>
          <span>Ref: <strong>{{runningRefDisplay}}</strong></span>
        </div>

        <div style="display:flex; flex-direction:column; flex:1;">


          <div class="sec-banner first-banner">
            <span>E. Proposed Solution and Improvement Opportunities</span>
          </div>


          <div class="q-block">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:2mm;">
              <div class="q-title">11. Do you have a proposed solution or improvement idea?</div>
              <div class="opt-flow">{{docQ11Prop}}</div>
            </div>
            <div class="response-wrap" style="margin-top:0.35mm;">
              <span class="response-label">If yes, describe it:</span>
              <div class="ruled-response-area doc-editable">{{outQ11Desc}}</div>
            </div>
          </div>


          <div class="q-block">
            <div class="q-title">12. What should an ideal solution achieve?</div>
            <div class="doc-chk-grid-3">{{docQ12Goals}}</div>
          </div>


          <div class="q-block no-bottom">
            <div class="q-title">13. Which areas could help solve this problem?</div>
            <div class="doc-chk-grid-3">{{docQ13Domains}}</div>
          </div>


          <div class="sec-banner">
            <span>F. Supporting Information</span>
          </div>
          <div class="q-block no-bottom">
            <div class="response-label" style="margin-bottom:0.3mm;">Available attachments:</div>
            <div class="doc-chk-grid-3">{{docFAttach}}</div>
          </div>


          <div class="sec-banner">
            <span>G. Submitter&#x27;s Confirmation</span>
          </div>
          <div class="q-block no-bottom" style="padding-bottom:2mm;">
            <div class="confirm-text">
              I confirm that the information provided is accurate to the best of my knowledge and relates to an actual organisational challenge or improvement opportunity.
            </div>
            <div class="signoff-grid-3">
              <div class="signoff-cell">
                <span class="signoff-cell-label">Submitted By:</span>
                <div class="signoff-cell-val doc-editable">{{outGSubBy}}</div>
              </div>
              <div class="signoff-cell">
                <span class="signoff-cell-label">Signature:</span>
                <div class="signoff-cell-val">
                  {{outGSigImg}}
                  <div class="doc-editable">{{outGSigText}}</div>
                </div>
              </div>
              <div class="signoff-cell">
                <span class="signoff-cell-label">Date:</span>
                <div class="signoff-cell-val doc-editable">{{outGDate}}</div>
              </div>
            </div>
          </div>

          <hr class="section-hr-rule">


          <div class="sec-banner" style="border-top:none;">
            <span>H. R&amp;D Team Evaluation – Internal Use Only</span>
          </div>
          <table class="doc-table">
            <thead>
              <tr>
                <th style="width:34%;">Evaluation Particular</th>
                <th style="width:66%;">Assessment</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="td-label">Problem Reference No. / Review Date</td>
                <td><div class="doc-editable">{{outHRefDate}}</div></td>
              </tr>
              <tr>
                <td class="td-label">Evaluated By</td>
                <td><div class="doc-editable">{{outHEvalBy}}</div></td>
              </tr>
              <tr>
                <td class="td-label">Relevant Department Head</td>
                <td><div class="doc-editable">{{outHDeptHead}}</div></td>
              </tr>
              <tr>
                <td class="td-label">Problem Verified?</td>
                <td><div class="opt-flow">{{docHVerified}}</div></td>
              </tr>
              <tr>
                <td class="td-label">Recurring Problem?</td>
                <td><div class="opt-flow">{{docHRecurring}}</div></td>
              </tr>
              <tr>
                <td class="td-label">Business Impact</td>
                <td><div class="opt-flow">{{docHImpact}}</div></td>
              </tr>
              <tr>
                <td class="td-label">Technical Feasibility</td>
                <td><div class="opt-flow">{{docHFeas}}</div></td>
              </tr>
              <tr>
                <td class="td-label">Market Solutions</td>
                <td><div class="opt-flow">{{docHMkt}}</div></td>
              </tr>
              <tr>
                <td class="td-label">Recommended Approach</td>
                <td><div class="opt-flow">{{docHApproach}}</div></td>
              </tr>
              <tr>
                <td class="td-label">Priority</td>
                <td><div class="opt-flow">{{docHPriority}}</div></td>
              </tr>
              <tr>
                <td class="td-label">Evaluation Decision</td>
                <td><div class="opt-flow">{{docHDecision}}</div></td>
              </tr>
            </tbody>
          </table>

          <div class="q-block" style="flex:1; justify-content:space-between; border-bottom:none; padding-top:1.5mm; padding-bottom:2mm;">
            <div style="display:flex; flex-direction:column; gap:1.8mm;">
              <div class="response-wrap">
                <span class="response-label">Evaluation Comments:</span>
                <div class="ruled-response-area doc-editable">{{outHComments}}</div>
              </div>
              <div class="response-wrap">
                <span class="response-label">Recommended Next Action:</span>
                <div class="ruled-response-area doc-editable">{{outHNextAction}}</div>
              </div>
            </div>

            <div class="signoff-grid-3" style="margin-top:1.5mm;">
              <div class="signoff-cell">
                <span class="signoff-cell-label">Reviewed By:</span>
                <div class="signoff-cell-val">
                  {{outHSigImg}}
                  <div class="doc-editable">{{outHRevBy}}</div>
                </div>
              </div>
              <div class="signoff-cell">
                <span class="signoff-cell-label">Approval / Recommendation:</span>
                <div class="signoff-cell-val doc-editable">{{outHApproval}}</div>
              </div>
              <div class="signoff-cell">
                <span class="signoff-cell-label">Date:</span>
                <div class="signoff-cell-val doc-editable">{{outHDate}}</div>
              </div>
            </div>
          </div>

        </div>
      </div>
      <div class="sheet-footer">
        <span>{{companyName}} — R&amp;D Initiative Form</span>
        <span>Page 2 of 2</span>
        <span class="footer-code">Format Code# PR#26-RND01</span>
      </div>
    </section>`;
