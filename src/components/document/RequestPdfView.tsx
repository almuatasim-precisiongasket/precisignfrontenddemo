import { useEffect, useState } from 'react';
import { ApiPreciSignRepository } from '../../services/apiRepository';
import type { RequestRecord } from '../../types';
import { getRequestDocumentVersion, RequestDocument } from './RequestDocument';

export function RequestPdfView({ requestId, version }: { requestId: string; version: number }) {
  const [request, setRequest] = useState<RequestRecord>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const repository = new ApiPreciSignRepository();
    void repository.getRequestById(requestId).then(record => {
      if (active) setRequest(record);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [requestId]);

  const document = request && getRequestDocumentVersion(request, version);
  if (failed || (request && !document)) return <p data-pdf-error>The requested document version is unavailable.</p>;
  if (!document) return <p>Loading document…</p>;
  return <main className="request-pdf-page" data-pdf-ready data-request-updated-at={request?.updatedAt}>
    <RequestDocument {...document} print />
  </main>;
}
