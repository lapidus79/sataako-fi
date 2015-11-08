import _ from 'lodash';
import url from 'url'
import request from 'request-promise'
import Promise from 'bluebird'
import {parseString} from 'xml2js'
import processors from 'xml2js/lib/processors'
import FMI from './fmi-constants'

const parseXml = Promise.promisify(parseString)

let featureUrl = url.parse(FMI.WFS_FEATURE_URL)
featureUrl.query = {
  request: 'getFeature',
  storedquery_id: 'fmi::radar::composite::rr'
}
const fmiRadarFramesRequest = url.format(featureUrl)
console.log(`Configured radar frames URL: ${fmiRadarFramesRequest}`)

function xmlToObject(featureQueryResultXml) {
  return parseXml(featureQueryResultXml, {tagNameProcessors: [processors.stripPrefix, processors.firstCharLowerCase]})
}

function extractFrameReferences(featureQueryResult) {
  return featureQueryResult.featureCollection.member.map((member) => {
    return {
      url: member.gridSeriesObservation[0].result[0].rectifiedGridCoverage[0].rangeSet[0].file[0].fileReference[0],
      timestamp: member.gridSeriesObservation[0].phenomenonTime[0].timeInstant[0].timePosition[0]
    }
  })
}

function setProjectionAndCleanupUrls(frameReferences) {
  function cleanupUrl(frameReference) {
    let radarUrl = url.parse(frameReference.url, true)
    radarUrl.query.format = 'image/png'
    radarUrl.query.width = FMI.WIDTH
    radarUrl.query.height = FMI.HEIGHT
    radarUrl.query.bbox = FMI.EPSG_3857_BOUNDS
    radarUrl.query.srs = FMI.EPSG_3857_SRS
    delete radarUrl.query.styles
    delete radarUrl.search
    return {
      url: url.format(radarUrl),
      timestamp: frameReference.timestamp
    }
  }

  return frameReferences.map(cleanupUrl)
}

function now() {
  return new Date().getTime()
}

let CACHED_RADAR_IMAGE_URLS = []
let CACHE_TIMESTAMP = now()

function updateCache(radarImageUrls) {
  CACHED_RADAR_IMAGE_URLS = radarImageUrls
  CACHE_TIMESTAMP = now()
  return radarImageUrls
}

function isCacheValid() {
  return ((now() - CACHE_TIMESTAMP) < 60 * 1000) && CACHED_RADAR_IMAGE_URLS.length > 0
}

function fetchRadarImageUrls() {
  if (isCacheValid()) {
    return Promise.resolve(CACHED_RADAR_IMAGE_URLS)
  }
  console.log('Updating radar frame list from FMI')
  return request(fmiRadarFramesRequest).then(xmlToObject).then(extractFrameReferences).then(setProjectionAndCleanupUrls).then(updateCache)
}

export {
  fetchRadarImageUrls
}