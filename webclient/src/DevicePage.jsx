import {MainSideNavbar} from './mainSideNavbar.jsx';
import {ErrorPopup} from './Popups.jsx';

import {useState, useEffect, useMemo} from 'react';
import {useNavigate, useParams} from 'react-router';

import styles from './DevicePage.module.css';

export default function DevicePage({
  APIBaseURL, URLToLoginPage, getUserSessionToken, clearUserSessionToken
}) {
  const linkParameters = useParams();  
  const [errorMessage, setErrorMessage] = useState("");
  const [deviceObject, setDeviceObject] = useState();
  const [datapoints, setDatapoints] = useState();
  
  const [deviceDataLabels, setDeviceDataLabels] = useState([]);
  const [deviceRows, setDeviceRows] = useState([]);
  const [refreshObject, setRefreshObject] = useState({});
  const navigate = useNavigate();
  
  function DatapointContainer({datapoint}){
    return(
      <tr className={styles.tableRow}>
        {datapoint.map((dataElement) => <td className={styles.table}>{dataElement}</td>)}
      </tr>
    );
  }
  
  async function getDeviceInfo(){
    let response;
    try{
      response = await fetch(`${APIBaseURL}/apiv1/device/${linkParameters.deviceIDStr}`, {
        headers:{
          authorization: getUserSessionToken()
        }
      });
    }catch(err){
      if(err instanceof TypeError)
        return setErrorMessage("Couldn't connect to server.");
      return setErrorMessage(String(err));
    }
    
    const invalidSessionToken = response.status === 401;
    if(invalidSessionToken) navigate(URLToLoginPage);
    
    if(!(response.ok))
      return setErrorMessage(`Received HTTP status ${response.status} from server.`);
    
    try{
      const objectFromResponse = await response.json();
      if(!(objectFromResponse.table instanceof Array))
        return setErrorMessage(".table attribute from server not array type.");

      setDeviceObject(objectFromResponse);
      if (objectFromResponse.table.length < 1)
        setDeviceDataLabels([]);
      else setDeviceDataLabels(Object.keys(objectFromResponse.table[0]));
    }catch(err){
      if(err instanceof TypeError)
        return setErrorMessage("Could not read response.");
      if(err instanceof TypeError)
        return setErrorMessage("Cannot parse response as JSON.");
      return setErrorMessage(String(err));
    }
    setErrorMessage("");
  }
  
  function getDatapointsAlignedToDataLabels(deviceTable, dataLabels){
    const alignedDatapoints = [];
    for(const datapoint of deviceTable){
      if(!(datapoint instanceof Object)){
        console.log(`$Datapoint {datapoint} not Object, skipping...`);
        continue;
      }
      
      const alignedDatapoint = [];
      for(const dataLabel of dataLabels)
        alignedDatapoint.push(datapoint[dataLabel]); 
      alignedDatapoints.push(alignedDatapoint);
    }
    return alignedDatapoints;
  }
  
  const callOnRerender = [];
  useEffect(() => {getDeviceInfo()}, callOnRerender);

  useEffect(() => {
    const msPerRefresh = 2000;
    const timerID = setTimeout(function (){
      getDeviceInfo();
      setRefreshObject({});
    }, msPerRefresh);

    return function (){clearTimeout(timerID);}
  }, [refreshObject]);
  
  useEffect(() => {
    if(!deviceObject) return;
    if(!deviceObject.table !== datapoints)
      setDatapoints(deviceObject.table);
    
    setDeviceRows(getDatapointsAlignedToDataLabels(deviceObject.table, deviceDataLabels));
  }, [deviceObject])

  const DatapointsVisual = useMemo(function (){
    return deviceRows.map((datapoint) => <DatapointContainer datapoint={datapoint}/>)
  }, [deviceRows]);

  const nothingToDisplay = !deviceObject && !errorMessage;
  if(nothingToDisplay) return;
  
  return (
    <div>
      {<ErrorPopup text={errorMessage} closeSelf={async () => {
        setErrorMessage("");
        getDeviceInfo();
      }}/>}
      <MainSideNavbar 
        URLToLoginPage={URLToLoginPage} clearUserSessionToken={clearUserSessionToken}
      />
      {
        deviceObject && <div>
          <div className={styles.topbar}>
            <h1 className={styles.topbarTitle}>{deviceObject.deviceName}</h1>
            <p className={styles.deviceID}>device ID: {linkParameters.deviceIDStr}</p>
          </div>
          <div className={styles.canvas}>
            <h2 className={styles.deviceDataHeader}>Device Data</h2>
            <table style={{borderSpacing: 0}}>
              <thead>
                <tr className={styles.tableRow}>
                  {deviceDataLabels.map((dataLabel) => <th className={styles.table}>{dataLabel}</th>)}
                </tr>
              </thead>
              <tbody>
                {DatapointsVisual}
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>
  );
}