    function summarizeBloomOverlap(apiary, forageRadiusMeters) {
      const circle = turf.circle([apiary.lng, apiary.lat], forageRadiusMeters / 1000, {
        steps: 96,
        units: 'kilometers'
      });

      const overlaps = [];
      const typeBuckets = {};
      let weightedScoreSum = 0;
      let totalOverlapArea = 0;

      const customIntersections = [];
      (customBloomData.features || []).forEach(feature => {
        try {
          const intersection = turf.intersect(circle, feature);
          if (!intersection) return;
          const areaSqKm = turf.area(intersection) / 1000000;
          if (areaSqKm <= 0) return;

          const rule = getRuleForFeature(feature);
          const score = getScoreForFeature(feature);
          const typeLabel = getFeatureDisplayLabel(feature);

          totalOverlapArea += areaSqKm;
          weightedScoreSum += score * areaSqKm;
          overlaps.push({ name: typeLabel, classLabel: rule.label, score, overlapAreaSqKm: areaSqKm });

          if (!typeBuckets[typeLabel]) {
            typeBuckets[typeLabel] = { typeLabel, score, totalAreaSqKm: 0 };
          }
          typeBuckets[typeLabel].totalAreaSqKm += areaSqKm;
          customIntersections.push(intersection);
        } catch (err) {
          console.warn('Skipping custom overlap calc', err);
        }
      });

      const customUnion = unionFeatures(customIntersections);

      (bloomAreaData.features || []).forEach(feature => {
        try {
          let intersection = turf.intersect(circle, feature);
          if (!intersection) return;

          if (customUnion) {
            try {
              const diff = turf.difference(intersection, customUnion);
              if (!diff) return;
              intersection = diff;
            } catch (err) {
              console.warn('Difference failed for base bloom feature', err);
            }
          }

          const overlapAreaSqKm = turf.area(intersection) / 1000000;
          if (overlapAreaSqKm <= 0) return;

          const rule = getRuleForFeature(feature);
          const score = getScoreForFeature(feature);
          const typeLabel = getFeatureDisplayLabel(feature);

          totalOverlapArea += overlapAreaSqKm;
          weightedScoreSum += score * overlapAreaSqKm;
          overlaps.push({ name: typeLabel, classLabel: rule.label, score, overlapAreaSqKm });

          if (!typeBuckets[typeLabel]) {
            typeBuckets[typeLabel] = { typeLabel, score, totalAreaSqKm: 0 };
          }
          typeBuckets[typeLabel].totalAreaSqKm += overlapAreaSqKm;
        } catch (err) {
          console.warn('Skipping overlap calc for feature:', getFeatureDisplayLabel(feature), err);
        }
      });

      overlaps.sort((a, b) => b.overlapAreaSqKm - a.overlapAreaSqKm);

      const ringAreaSqKm = getRingAreaSqKm(forageRadiusMeters);
      const groupedTypes = Object.values(typeBuckets)
        .map(bucket => ({
          ...bucket,
          percentOfRing: ringAreaSqKm > 0 ? (bucket.totalAreaSqKm / ringAreaSqKm) * 100 : 0
        }))
        .sort((a, b) => b.percentOfRing - a.percentOfRing);

      const averageScore = totalOverlapArea > 0 ? weightedScoreSum / totalOverlapArea : 0;
      return {
        averageScore,
        overallLabel: scoreToLabel(averageScore),
        overlapCount: overlaps.length,
        totalOverlapAreaSqKm: totalOverlapArea,
        ringAreaSqKm,
        topAreas: overlaps.slice(0, 3),
        groupedTypes: groupedTypes.slice(0, 6)
      };
    }


