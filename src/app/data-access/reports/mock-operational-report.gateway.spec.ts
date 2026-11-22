import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ReportFilters } from '../../core/reports/operational-report.models';
import { MockOperationalReportGateway } from './mock-operational-report.gateway';

const FILTERS: ReportFilters = {
  from: '2026-11-01',
  to: '2026-11-19',
  product: null,
  status: null,
};

describe('MockOperationalReportGateway', () => {
  let gateway: MockOperationalReportGateway;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MockOperationalReportGateway] });
    gateway = TestBed.inject(MockOperationalReportGateway);
  });

  it('returns a consistent report and downloads it for the same fingerprint', async () => {
    const report = await firstValueFrom(gateway.report(FILTERS, '2026-11-19T10:00:00Z'));
    const byStatus = Object.values(report.policies.byStatus).reduce((a, b) => a + b, 0);
    expect(byStatus).toBe(report.policies.portfolio);
    expect(report.cutOff).toBe('2026-11-19T10:00:00Z');

    const download = await firstValueFrom(
      gateway.download(FILTERS, report.cutOff, report.fingerprint),
    );
    expect(await download.file.text()).toContain(report.cutOff);
  });

  it('rejects a download for another fingerprint', async () => {
    await expect(
      firstValueFrom(gateway.download(FILTERS, '2026-11-19T10:00:00Z', 'f'.repeat(64))),
    ).rejects.toMatchObject({ kind: 'not-reproducible' });
  });
});
