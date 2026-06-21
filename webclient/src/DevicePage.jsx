import {MainSideNavbar} from './mainSideNavbar.jsx';
import {ErrorPopup} from './Popups.jsx';
import {userSessionToken} from './globals.jsx';

import {useState, useEffect} from 'react';
import {useNavigate, useParams} from 'react-router';
import styles from './DevicePage.module.css';

function DevicePage({APIBaseURL, redirectToLogin, selectedPage, paramsForMainSideNavbar}) {
  const linkParameters = useParams();  
  const [errorMessage, setErrorMessage] = useState();
  const [deviceObject, setDeviceObject] = useState();
  const [deviceDataLabels, setDeviceDataLabels] = useState([]);
  const [deviceRows, setDeviceRows] = useState([]);
  const navigate = useNavigate();
  
  if(!userSessionToken) navigate(redirectToLogin);
  
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
          authorization: userSessionToken
        }
      });
    }catch(err){
      if(err instanceof TypeError)
        return setErrorMessage("Couldn't connect to server.");
      return setErrorMessage(String(err));
    }
    
    if(!(response.ok))
      return setErrorMessage(`Received HTTP status ${response.status} from server.`);
    
    try{
      const objectFromResponse = await response.json();
      const noDatapoints = objectFromResponse.table.length < 1;
      if(noDatapoints) return setDeviceDataLabels([]);
      
      setDeviceObject(objectFromResponse);
      setDeviceDataLabels(Object.keys(objectFromResponse.table[0]));
    }catch(err){
      if(err instanceof TypeError)
        return setErrorMessage("Could not read response.");
      if(err instanceof TypeError)
        return setErrorMessage("Cannot parse response as JSON.");
      setErrorMessage(String(err));
    }
  }
  
  function getDatapointsAlignedToDataLabels(deviceTable, dataLabels){
    const alignedDatapoints = [];
    for(const datapoint of deviceTable){
      const alignedDatapoint = [];
      for(const dataLabel of dataLabels)
        alignedDatapoint.push(datapoint[dataLabel]); 
      alignedDatapoints.push(alignedDatapoint);
    }
    return alignedDatapoints;
  }
  
  const callOnRerender = [];
  useEffect(() => {
    getDeviceInfo();
  }, callOnRerender);
  
  useEffect(() => {
    if(!deviceObject) return;
    setDeviceRows(getDatapointsAlignedToDataLabels(deviceObject.table, deviceDataLabels));
  }, [deviceObject])

  if(!deviceObject) return;
  
  return (
    <div>
      <MainSideNavbar selectedPage={selectedPage} params={paramsForMainSideNavbar}/>
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
            {deviceRows.map((datapoint) => <DatapointContainer datapoint={datapoint}/>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DevicePage;
