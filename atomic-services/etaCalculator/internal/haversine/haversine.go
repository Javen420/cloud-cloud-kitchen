package haversine

import "math"

// Converts degrees(coordinates) to radians
func toRad(deg float64) float64 {
	return deg * math.Pi / 180
}

// DistanceKm manually calculates the distance between the two points
// It uses the haversine formula, which takes in the lat, long values on a globe to calc the distance
func DistanceKm(lat1, lng1, lat2, lng2 float64) float64 {
	const R = 6371.0
	dLat := toRad(math.Abs(lat1 - lat2)) //since Singapore is above the equator, just have to minus
	dLng := toRad(math.Abs(lng1 - lng2)) //same hemisphere as well
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(toRad(lat1))*math.Cos(toRad(lat2))*
			math.Sin(dLng/2)*math.Sin(dLng/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

// FallbackETA	estimates the time that the driver will take based off distance
// Assumes 30km/hr speed on road, slower than irl because we are using straight line distance
func FallbackETA(lat1, lng1, lat2, lng2 float64) (minutes int, distMeters int) {
	distKm := DistanceKm(lat1, lng1, lat2, lng2)
	minutes = int(math.Ceil(distKm / 30.0 * 60.0))
	if minutes < 1 {
		minutes = 1
	}
	return minutes, int(distKm * 1000)
}

//Euclidean kinda works especially for Singapore, but its meant for flat planes only
//func EuclideanDistance(lat1, lng1, lat2, lng2 float64) float64 {
//	dLat := math.Pow(lat1-lat2, 2.0) * 111.0
//	dlng := math.Pow(lng1-lng2, 2.0) * 111.0
//	return math.Sqrt(dLat + dlng)
//}
