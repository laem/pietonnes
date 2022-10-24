import { MapContainer } from 'react-leaflet/MapContainer'
import { TileLayer } from 'react-leaflet/TileLayer'
import { GeoJSON } from 'react-leaflet/GeoJSON'
import { Marker } from 'react-leaflet/Marker'
import { Popup } from 'react-leaflet/Popup'
import L from 'leaflet'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import distance from '@turf/distance'
import center from '@turf/center'
import point from 'turf-point'
import { polygon } from '@turf/helpers'
import APIUrl from './APIUrl'
import booleanContains from '@turf/boolean-contains'

const createTurfPointCollection = (points) => ({
	type: 'FeatureCollection',
	features: points.map((p) => ({
		type: 'Feature',
		properties: {},
		geometry: {
			type: 'Point',
			coordinates: [p.lon, p.lat],
		},
	})),
})

const maxCityDistance = 20 // was used previously, but I think the next threshold is better
const nearestPointsLimit = 4 // 4 is a symbolic number : think of a compass

const MapTilerKey = '1H6fEpmHR9xGnAYjulX3'

const defaultCenter = [48.10999850495452, -1.679193852233965]

export default () => {
	const { ville } = useParams()

	const [couple, setCouple] = useState({ from: null, to: null })
	const [rawData, setData] = useState(null) // use an empty array as initial value
	const [clickedSegment, setClickedSegment] = useState()
	const [rides, setRides] = useState([])
	const [points, setPoints] = useState([])

	useEffect(() => {
		if (!(couple.to && couple.from)) return undefined
		computeBikeDistance(couple.from, couple.to).then((res) => {
			setData(res) // set the state
		})
	}, [couple])

	useEffect(() => {
		if (!ville) return

		fetch(APIUrl + `points/${ville}`)
			.then((res) => {
				if (!res.ok) {
					throw res
				}
				return res.json()
			})
			.then((json) => {
				console.log('json', json)

				const worldPoints = json.elements
					.filter(
						(element) => element.tags && element.tags['amenity'] === 'townhall'
					)
					.map((element) => {
						if (element.type === 'way') {
							const firstNode = json.elements.find(
								(node) => node.id === element.nodes[0]
							)
							return { ...element, lat: firstNode.lat, lon: firstNode.lon }
						}
						if (element.type === 'relation') {
							const firstRef = json.elements.find(
								(node) => node.id === element.members[0].ref
							)
							const firstNode = json.elements.find(
								(node) => node.id === firstRef.nodes[0]
							)
							return { ...element, lat: firstNode.lat, lon: firstNode.lon }
						}
						return element
					})

				const points = worldPoints.filter((p) =>
					booleanContains(
						polygon([[...metropolitanFrance, metropolitanFrance.at(0)]]),
						point([p.lon, p.lat])
					)
				)
				console.log({ points })
				setPoints(points)
				points.map((p, i) => {
					const point1 = point([p.lon, p.lat])

					const sorted = points
						.filter((p2) => p != p2)
						.sort(
							(pa, pb) =>
								distance(point([pa.lon, pa.lat]), point1) -
								distance(point([pb.lon, pb.lat]), point1)
						)
					const firstX = sorted.slice(0, nearestPointsLimit)

					firstX.map((p2, j) =>
						setTimeout(
							() =>
								computeBikeDistance([p.lat, p.lon], [p2.lat, p2.lon]).then(
									(res) => setRides((rides) => [...rides, res])
								),
							100 * (i + j)
						)
					)
				})
			})
			.catch((error) => console.log('erreur dans la requête OSM', error))
	}, [])

	const pointsCenter = useMemo(() => {
		if (!points.length) return
		const pointCollection = createTurfPointCollection(points)
		console.log({ pointCollection })
		return center(pointCollection)
	}, [points])

	const data = rawData && segmentGeoJSON(rawData)

	const safePercentage =
		rides.length > 0 &&
		computeSafePercentage(rides.map((ride) => getMessages(ride)).flat())

	const segments = rides
		.map((ride) => segmentGeoJSON(ride))
		.map((r) => r.features)
		.flat()
	console.log('segments', segments, segments.length)
	return (
		<div
			css={`
				max-width: 1000px;
				margin: 0 auto;
			`}
		>
			<h1>Ma ville est-elle cyclable ?</h1>
			<p>
				Précisons : <em>vraiment</em> cyclable, donc avec des pistes cyclables
				séparées ou des voies où le vélo est prioritaire sur les voitures.
				<p>
					La méthode de test : on calcule le trajet vélo le plus sécurisé entre
					les mairies des communes séparées de moins de 10km
				</p>
			</p>
			<p>Pour le découvrir, cliquez 2 points sur la carte, on vous le dira. </p>
			<p>Puis recommencez :)</p>
			{safePercentage && (
				<p>
					Ce trajet est <strong>sécurisé à {safePercentage}%</strong>.
				</p>
			)}
			{clickedSegment && JSON.stringify(clickedSegment.properties)}
			<div css="height: 600px; width: 900px; > div {height: 100%; width: 100%}; margin-bottom: 2rem">
				{!pointsCenter ? (
					'Chargement des données'
				) : (
					<MapContainer
						center={
							(pointsCenter && pointsCenter.geometry.coordinates.reverse()) ||
							defaultCenter
						}
						zoom={12}
					>
						<TileLayer
							attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors; MapTiler'
							url={`https://api.maptiler.com/maps/toner/{z}/{x}/{y}.png?key=${MapTilerKey}`}
						></TileLayer>

						<GeoJSON
							key={segments.length}
							data={segments}
							eventHandlers={{
								mouseover: (e) => {
									setClickedSegment(e.sourceTarget.feature)
								},
							}}
							style={(feature) => ({
								...(feature.properties || {
									color: '#4a83ec',
									weight: 5,
									fillColor: '#1a1d62',
									fillOpacity: 1,
								}),
								...(clickedSegment === feature ? { color: 'chartreuse' } : {}),
							})}
						/>
						{points.map((point) => (
							<Marker
								position={[point.lat, point.lon]}
								icon={
									new L.Icon({
										iconUrl: 'https://openmoji.org/data/color/svg/E209.svg',
										iconSize: [30, 30],
									})
								}
							>
								<Popup>{JSON.stringify({ id: point.id, ...point.tags })}</Popup>
							</Marker>
						))}
					</MapContainer>
				)}
			</div>

			{/*
				<Map
					provider={provider}
					height={'800px'}
					width={'800px'}
					defaultZoom={11}
					onClick={({ event, latLng, pixel }) => {
						setCouple(
							!couple.from
								? { from: latLng }
								: couple.to
								? { from: latLng }
								: { ...couple, to: latLng }
						)
					}}
				>
					{couple.from && <Marker width={50} anchor={couple.from} />}
					{couple.to && <Marker width={50} anchor={couple.to} />}
					<GeoJson>
						{rides.length > 0 &&
							rides
								.filter(Boolean)
								.map((ride) => segmentGeoJSON(ride))

								.map((r) => r.features)
								.flat()
								.map((feature) => (
									<GeoJsonFeature
										feature={feature}
										styleCallback={myStyleCallback}
									/>
								))}
						{data && (
							<GeoJsonFeature
								onClick={({ event, anchor, payload }) => {
									setClickedSegment(payload.properties)
								}}
								feature={data}
								styleCallback={myStyleCallback}
							/>
						)}
					</GeoJson>
					{points.map(({ lon, lat }) => (
						<Overlay anchor={[lat, lon]} offset={[15, 15]}>
							<img
								src="https://openmoji.org/data/color/svg/E209.svg"
								width={30}
								height={30}
								alt=""
							/>
						</Overlay>
					))}
				</Map>
	*/}
		</div>
	)
}

const myStyleCallback = (feature, hover) => {
	return feature.properties
}

const isSafePath = (tags) =>
	tags.includes('highway=living_street') || tags.includes('highway=cycleway')
//TODO should we include foot paths where bikes have a separated painted lane ? I'm not sure we should. It usually creates friction between bikes and pedestrians
// maybe when it is segregated ? segregated footway and cycleway tagged on one way highway=path + bicycle=designated + foot=designated + segregated=yes
// https://wiki.openstreetmap.org/wiki/Tag:bicycle%3Ddesignated
//
// https://www.openstreetmap.org/way/190390497
// bicycle 	designated ?

const createBikeRouterQuery = (from, to) =>
	encodeURIComponent(`${from.reverse().join(',')}|${to.reverse().join(',')}`)
const computeBikeDistance = (from, to) =>
	fetch(APIUrl + `bikeRouter/${createBikeRouterQuery(from, to)}`)
		.then((res) => res.json())
		.catch((e) => console.log(e))

const getMessages = (geojson) => {
	const [_, ...table] = geojson.features[0].properties.messages

	return table
}
const computeSafePercentage = (messages) => {
	const [safeDistance, total] = messages.reduce(
		(memo, next) => {
			const safe = isSafePath(next[9]),
				distance = next[3]
			return [memo[0] + (safe ? +distance : 0), memo[1] + +distance]
		},
		[0, 0]
	)

	return Math.round((safeDistance / total) * 100)
}
const segmentGeoJSON = (geojson) => {
	const table = getMessages(geojson)
	const coordinateStringToNumber = (string) => +string / 10e5
	const getLineCoordinates = (line) =>
			line && [line[0], line[1]].map(coordinateStringToNumber),
		getLineDistance = (line) => line[3],
		getLineTags = (line) => line[9]

	return {
		type: 'FeatureCollection',
		features: table
			.slice(0, -1)
			.map((line, i) => {
				// What a mess, this is hacky
				// TODO : the "messages" table contains way less segments than the LineString. They are grouped. We should reconstruct them as Brouter Web does
				const lineBis = table[i + 1]
				if (!lineBis) return

				return {
					type: 'Feature',
					properties: {
						tags: getLineTags(lineBis),
						distance: lineBis[3],
						elevation: lineBis[2],
						weight: '3',
						opacity: '.8',
						color: isSafePath(getLineTags(lineBis)) ? 'blue' : 'red',
					},
					geometry: {
						type: 'LineString',
						coordinates: [
							getLineCoordinates(line),
							getLineCoordinates(table[i + 1]),
						],
					},
				}
			})
			.filter(Boolean),
	}
}

// the Paris query can return points in the united states ! Hence we test the containment.
// Hack, breaks Corsica and Outre mer :/
// (bikes don't exist in Corsica anyway yet)
const metropolitanFrance = [
	[3.117332261403533, 42.310950518868566],
	[8.62616012109811, 48.98439932416892],
	[2.6058486182378147, 51.30150608949904],
	[-5.353852828534542, 48.42923941831151],
]
