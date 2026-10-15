import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { readmeOptions } from '../../scripts/readme-options';
import { readmeImages } from '../../scripts/readme-capture';
import manifest from '../../docs/images/manifest.json';

describe('README画像の生成', () => {
  it('既定は外部通信しない予行で、実撮影は試行IDとliveの両方を要求する', () => {
    expect(readmeOptions([])).toEqual({ live: false, attempt: undefined });
    expect(readmeOptions(['--offline']).live).toBe(false);
    expect(readmeOptions(['--live', '--attempt', 'approved-123'])).toEqual({ live: true, attempt: 'approved-123' });
    for (const args of [
      ['--live'],
      ['--attempt', 'approved-123'],
      ['--live', '--offline'],
      ['--live', '--attempt', '../outside'],
      ['--live', '--attempt'],
      ['--live', '--attempt', '--offline'],
      ['--unexpected'],
      ['--offline', '--offline'],
      ['--live', '--attempt', 'approved-123', '--attempt', 'another-123'],
    ])
      expect(() => readmeOptions(args)).toThrow();
  });

  it('READMEから全画像へ到達でき、manifestが実ファイルの内容と一致する', async () => {
    const readme = await Bun.file(new URL('../../README.md', import.meta.url)).text();
    expect(manifest.completed).toBe(true);
    expect(manifest.source).toBe('live-sm9');
    expect(manifest.proxy).toBe('direct');
    expect(manifest.images.map((image) => image.name).sort()).toEqual([...readmeImages].sort());
    for (const image of manifest.images) {
      expect(readme).toContain(`](docs/images/${image.name}.png)`);
      const data = Buffer.from(
        await Bun.file(new URL(`../../docs/images/${image.name}.png`, import.meta.url)).arrayBuffer()
      );
      expect(data.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(data.readUInt32BE(16)).toBeGreaterThan(600);
      expect(data.readUInt32BE(20)).toBeGreaterThan(150);
      expect(data.length).toBe(image.bytes);
      expect(createHash('sha256').update(data).digest('hex')).toBe(image.sha256);
    }
  });
});
