import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../shared/empty-state';
import { ErrorState } from '../../shared/error-state';
import { LoadingRows } from '../../shared/loading-rows';
import { Pagination } from '../../shared/pagination';
import { StatusPill } from '../../shared/status-pill';
import { monthLabel, dateBr } from '../../shared/format';
import { ContactAreaService } from './contact-area.service';

@Component({
  selector: 'app-periods-list-page',
  imports: [RouterLink, EmptyState, ErrorState, LoadingRows, Pagination, StatusPill],
  templateUrl: './periods-list-page.html',
})
export class PeriodsListPage {
  private readonly service = inject(ContactAreaService);

  protected readonly monthLabel = monthLabel;
  protected readonly dateBr = dateBr;

  protected readonly page = signal(1);
  protected readonly perPage = 20;

  protected readonly periods = this.service.periods(() => ({
    page: this.page(),
    perPage: this.perPage,
  }));
}
