import React, { useState } from 'react';
import ReactMapGL, { Marker, NavigationControl, ViewState } from 'react-map-gl';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMapPin } from '@fortawesome/free-solid-svg-icons';

import { Location } from '../../types';
import 'mapbox-gl/dist/mapbox-gl.css';
import './stylesheet.scss';

export type MapLocation = {
  section: string;
  id: string;
  coords: Location | null;
};

export type MapViewProps = {
  locations: MapLocation[];
};

export default function MapView({
  locations,
}: MapViewProps): React.ReactElement {
  // These initial coordinates start the map looking at the UIUC campus
  const [viewState, setViewState] = useState<ViewState>({
    latitude: 40.103515,
    longitude: -88.227966,
    zoom: 14.32,
  });

  const unknown: MapLocation[] = [];
  const coordsToLocationsMap = new Map<Location, MapLocation[]>();
  locations.forEach((location) => {
    if (location.coords === null) {
      unknown.push(location);
    } else if (coordsToLocationsMap.has(location.coords)) {
      coordsToLocationsMap.get(location.coords)?.push(location);
    } else {
      coordsToLocationsMap.set(location.coords, [location]);
    }
  });

  // Use custom UIUC scheduler map style
  const mapStyle = 'mapbox://styles/lightningboltz21/cmkad1y6c005k01s620czavvk';

  return (
    <div className="mapbox">
      <ReactMapGL
        height="100%"
        width="100%"
        viewState={viewState}
        mapStyle={mapStyle}
        mapboxApiAccessToken={process.env['REACT_APP_MAPBOX_TOKEN'] ?? ''}
        onViewStateChange={({
          viewState: newViewState,
        }: {
          viewState: ViewState;
        }): void => setViewState(newViewState)}
      >
        {Array.from(coordsToLocationsMap.entries()).map(
          ([coords, coordLocations], i) => (
            <Marker key={i} latitude={coords.lat} longitude={coords.long}>
              <FontAwesomeIcon icon={faMapPin} className="pin-icon" />
              <div className="pin-text">
                {coordLocations.map((coordLocation) => (
                  <div key={coordLocation.id + coordLocation.section}>
                    {coordLocation.id} {coordLocation.section}
                  </div>
                ))}
              </div>
            </Marker>
          )
        )}
        {unknown.length > 0 && (
          <div className="unknown-container">
            <b>Undetermined</b>
            {unknown.map((location, i) => (
              <div className="class" key={i}>
                {location.id} {location.section}
              </div>
            ))}
          </div>
        )}
        <div className="navigation">
          <NavigationControl showZoom showCompass />
        </div>
      </ReactMapGL>
    </div>
  );
}
