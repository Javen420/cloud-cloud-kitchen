const mockEtaData = {
  "ORD-4821": {
    pickup: {
      orderId: "ORD-4821",
      stage: "pickup",
      distanceKm: 3.8,
      durationMinutes: 9,
      fromLabel: "Current rider location",
      toLabel: "10 Oak Street",
      source: "redis",
    },
    delivery: {
      orderId: "ORD-4821",
      stage: "delivery",
      distanceKm: 5.4,
      durationMinutes: 13,
      fromLabel: "10 Oak Street",
      toLabel: "45 Maple Ave",
      source: "google-routes",
    },
  },
  "ORD-4822": {
    pickup: {
      orderId: "ORD-4822",
      stage: "pickup",
      distanceKm: 2.6,
      durationMinutes: 6,
      fromLabel: "Current rider location",
      toLabel: "15 Clementi Road",
      source: "redis",
    },
    delivery: {
      orderId: "ORD-4822",
      stage: "delivery",
      distanceKm: 4.9,
      durationMinutes: 12,
      fromLabel: "15 Clementi Road",
      toLabel: "22 Sunset Way",
      source: "google-routes",
    },
  },
};

export async function getMockEtaTracking(orderId, stage) {
  await new Promise((resolve) => setTimeout(resolve, 300));

  const orderEta = mockEtaData[orderId];
  if (!orderEta || !orderEta[stage]) {
    throw new Error("ETA data not found");
  }

  return orderEta[stage];
}
