import bbox from "@turf/bbox";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import * as turfModel from "@turf/helpers";
import randomPositionInPolygon from "random-position-in-polygon";
import { AREA_MODE, GAME_MODE } from "./constants";
import { getAreaCodeNameFromLatLng, getMaxDistanceBbox, isInGeoJSON } from "./";

class StreetViewService {
  settingsPanorama: any;
  settingsGame: any;
  placeGeoJson: any;
  roundsPredefined: any;
  //@ts-ignore
  service: google.maps.StreetViewService;
  alreadyVisited: any[];

  constructor(
    settingsPanorama: any,
    settingsGame: any,
    placeGeoJson: any,
    roundsPredefined: any
  ) {
    this.settingsPanorama = settingsPanorama;
    this.settingsGame = settingsGame;
    this.placeGeoJson = placeGeoJson;
    this.roundsPredefined = roundsPredefined;
    //@ts-ignore
    this.service = new google.maps.StreetViewService();
    this.alreadyVisited = [];
  }

  async getStreetView(round: number, cptNotFoundLocation: number = 0) {
    let radius: number,
      //@ts-ignore
      position: google.maps.LatLng,
      randomFeatureProperties: any;
    if (this.roundsPredefined) {
      radius = 50;
      const positions = this.roundsPredefined[round - 1];
      //@ts-ignore
      position = new google.maps.LatLng(positions[0], positions[1]);
    } else {
      let randomPos;
      do {
        randomPos = this.getRandomLatLng();
      } while (this.alreadyVisited.includes(randomPos.position.toString()));

      this.alreadyVisited.push(randomPos.position.toString());

      radius = randomPos.radius;
      position = randomPos.position;
      randomFeatureProperties = randomPos.properties;
    }

    return new Promise<any>((resolve) => {
      this.service.getPanorama(
        {
          location: position,
          preference: "nearest",
          radius,
          source: this.settingsPanorama.allPanorama ? "default" : "outdoor"
        },
        async (
          //@ts-ignore
          data: google.maps.StreetViewPanoramaData,
          //@ts-ignore
          status: google.maps.StreetViewStatus
        ) => {
          if (
            //@ts-ignore
            status !== google.maps.StreetViewStatus.OK ||
            !data ||
            !data.location ||
            !this._checkStreetView(data)
          ) {
            resolve(await this.getStreetView(round));
          } else {
            resolve(
              await this._getResponseStreetViewService(
                round,
                data,
                cptNotFoundLocation,
                randomFeatureProperties
              )
            );
          }
        }
      );
    });
  }

  async _getResponseStreetViewService(
    round: number,
    //@ts-ignore
    data: google.maps.StreetViewPanoramaData,
    cptNotFoundLocation: number,
    randomFeatureProperties: any
  ) {
    let isInGeoJSONResult: boolean,
      isVisibleDialog = false;
    if (this.placeGeoJson != null) {
      isInGeoJSONResult = isInGeoJSON(
        turfModel.point([
          data.location.latLng.lng(),
          data.location.latLng.lat()
        ]),
        this.placeGeoJson
      );
    }
    if (isInGeoJSONResult === false && cptNotFoundLocation < 3) {
      return this.getStreetView(round, cptNotFoundLocation + 1);
    } else {
      // If 3 times Street View does not find location in the polygon placeGeoJson print warning message
      if (isInGeoJSONResult === false) {
        isVisibleDialog = true;
      }
      let areaCode: string;
      try {
        areaCode = await this._getAreaCode(data);
      } catch (err) {
        return this.getStreetView(round);
      }

      return {
        panorama: data,
        roundInfo: randomFeatureProperties || null,
        area: areaCode,
        warning: isVisibleDialog
      };
    }
  }

  getRandomLatLng() {
    if (this.placeGeoJson != null) {
      let position: number[],
        radius: number,
        properties = null;
      if (this.placeGeoJson.type === "FeatureCollection") {
        let randInt = Math.floor(
          Math.random() * this.placeGeoJson.features.length
        );

        const feature = this.placeGeoJson.features[randInt];
        properties = feature.properties;
        if (feature.geometry.type === "Point") {
          position = feature.geometry.coordinates;
          radius = 50;
        } else {
          radius = getMaxDistanceBbox(bbox(feature)) * 100;
          position = randomPositionInPolygon(feature);
        }
      } else {
        radius = getMaxDistanceBbox(bbox(this.placeGeoJson)) * 100;
        position = randomPositionInPolygon(this.placeGeoJson);
      }

      return {
        radius,
        //@ts-ignore
        position: new google.maps.LatLng(position[1], position[0]),
        properties
      };
    }

    // Generate a random latitude and longitude
    const lat = Math.random() * 170 - 85;
    const lng = Math.random() * 360 - 180;

    return {
      radius: 100000,
      //@ts-ignore
      position: new google.maps.LatLng(lat, lng),
      properties: null
    };
  }

  //@ts-ignore
  _checkStreetView(data: google.maps.StreetViewPanoramaData) {
    return !(
      this.settingsPanorama.optimiseStreetView &&
      (!/^\xA9 (?:\d+ )?Google$/.test(data.copyright) ||
        !data.imageDate ||
        data.links.length < 2 ||
        (Array.isArray(data.g) && data.g.length !== 0))
    );
  }

  //@ts-ignore
  async _getAreaCode(data: google.maps.StreetViewPanoramaData) {
    if (
      [GAME_MODE.COUNTRY, GAME_MODE.CUSTOM_AREA].includes(
        this.settingsGame.mode
      )
    ) {
      if (
        this.settingsGame.mode === GAME_MODE.COUNTRY ||
        (this.settingsGame.areaParams &&
          this.settingsGame.areaParams.data.type === AREA_MODE.NOMINATIM)
      ) {
        return getAreaCodeNameFromLatLng(
          data.location.latLng,
          this.settingsGame.areaParams && this.settingsGame.areaParams.data
        );
      } else {
        const area = this.settingsGame.areasJson.features.find((feature: any) =>
          booleanPointInPolygon(
            [data.location.latLng.lng(), data.location.latLng.lat()],
            feature
          )
        );

        if (!area) {
          throw new Error("Area not found");
        } else {
          const key = this.settingsGame.areaParams
            ? this.settingsGame.areaParams.data.pathKey
            : "iso_a2";
          return area.properties[key];
        }
      }
    }
  }
}

export default StreetViewService;
