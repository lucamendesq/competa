import { Component, computed, inject } from '@angular/core';
import type { AudienceDeviceStats, DevicePlatform } from '@contabilidade/contracts';
import { SettingsService } from './settings.service';

const LABELS: Record<DevicePlatform, string> = {
  ios: 'iOS',
  android: 'Android',
  desktop: 'Desktop',
  other: 'Outro',
};

type AudienceRow = {
  title: string;
  description: string;
  total: number;
  installed: number;
  platforms: {
    label: string;
    count: number;
    percent: number;
    installed: number;
  }[];
};

const mapAudience = (
  title: string,
  description: string,
  data?: AudienceDeviceStats,
): AudienceRow => {
  const total = data?.total ?? 0;
  const installed = data?.installed ?? 0;
  const byPlatform = data?.byPlatform;

  const platforms = (Object.keys(LABELS) as DevicePlatform[]).map((key) => {
    const count = byPlatform?.[key]?.total ?? 0;
    const inst = byPlatform?.[key]?.installed ?? 0;
    return {
      label: LABELS[key],
      count,
      percent: total ? Math.round((count / total) * 100) : 0,
      installed: inst,
    };
  });

  return { title, description, total, installed, platforms };
};

@Component({
  selector: 'app-devices-tab',
  templateUrl: './devices-tab.html',
})
export class DevicesTab {
  private readonly service = inject(SettingsService);
  protected readonly stats = this.service.deviceStats();

  protected readonly audiences = computed(() => {
    const data = this.stats.value();
    return [
      mapAudience(
        'Responsáveis das Empresas',
        'Aparelhos usados pelos clientes para acessar a área logada.',
        data?.contacts,
      ),
      mapAudience(
        'Equipe da Contabilidade',
        'Aparelhos usados pelos contadores para acessar o painel.',
        data?.accountants,
      ),
    ];
  });
}
