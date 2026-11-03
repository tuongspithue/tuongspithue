import {
  bayesianStars,
  confirmSpeedScore,
  decayedRate,
  dispatchDistanceFactor,
  starsToScore,
  tierFor,
  weightedScore,
} from '../src';

describe('điểm uy tín v1 (Phần 11)', () => {
  it('sự kiện gần đây nặng hơn sự kiện cũ', () => {
    const recentBad = decayedRate([
      { value: 0, ageDays: 1 },
      { value: 1, ageDays: 60 },
    ])!;
    const oldBad = decayedRate([
      { value: 1, ageDays: 1 },
      { value: 0, ageDays: 60 },
    ])!;
    expect(recentBad).toBeLessThan(0.5);
    expect(oldBad).toBeGreaterThan(0.5);
    expect(decayedRate([])).toBeNull();
  });

  it('sao Bayes: 3 đánh giá 5★ không vượt 2.000 đánh giá 4,8★', () => {
    const newcomer = bayesianStars(15, 3, 4.5);
    const veteran = bayesianStars(4.8 * 2000, 2000, 4.5);
    expect(newcomer).toBeLessThan(veteran);
  });

  it('quy đổi sao và tốc độ xác nhận ra điểm', () => {
    expect(starsToScore(5)).toBe(100);
    expect(starsToScore(1)).toBe(0);
    expect(confirmSpeedScore(20)).toBe(100);
    expect(confirmSpeedScore(105)).toBe(50);
    expect(confirmSpeedScore(400)).toBe(0);
  });

  it('thành phần chưa có dữ liệu được bỏ qua, trọng số chia lại', () => {
    expect(weightedScore([{ key: 'a', weight: 40, score: 90 }, { key: 'b', weight: 60, score: null }])).toBe(90);
    expect(weightedScore([{ key: 'a', weight: 40, score: null }])).toBe(70);
  });

  it('xếp cấp: dưới 30 đơn là Tân binh; Kim cương cần ≥ 500 đơn', () => {
    expect(tierFor(99, 10)).toBe('ROOKIE');
    expect(tierFor(95, 200)).toBe('GOLD');
    expect(tierFor(95, 600)).toBe('DIAMOND');
    expect(tierFor(70, 100)).toBe('SILVER');
    expect(tierFor(55, 100)).toBe('BRONZE');
    expect(tierFor(40, 100)).toBe('IMPROVE');
  });

  it('uy tín cao được ưu tiên như ở gần hơn khi mời chuyến', () => {
    expect(dispatchDistanceFactor(100)).toBeCloseTo(0.8);
    expect(dispatchDistanceFactor(50)).toBe(1);
    expect(dispatchDistanceFactor(0)).toBeCloseTo(1.2);
  });
});
