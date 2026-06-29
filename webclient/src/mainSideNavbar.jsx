import styles from './mainSideNavbar.module.css'

import {useNavigate} from 'react-router';
import {BsCpu} from 'react-icons/bs';

export const SelectedPageEnums = {
  WTF: 0,
  DEVICE: 1,
};

export function MainSideNavbar({selectedPage, params, clearUserSessionToken}){
  const navigate = useNavigate();
  
  return (
    <nav className={styles.sidebar}>
      <button className={styles.sidebarButton} onClick={() => navigate(params.relativeLinkToHome)}>
        <img src="/honeycomb.png" alt="honeycomb icon" className={styles.honeycombIcon}/> 
      </button>
      <button 
        className={selectedPage === SelectedPageEnums.DEVICE ? styles.sidebarButtonSelected : styles.sidebarButton}
      >
        <BsCpu style={{fontSize: "40px"}}/>
        <p>Devices</p>
      </button>
      <button 
        className={selectedPage ===  SelectedPageEnums.WTF ? styles.sidebarButtonSelected : styles.sidebarButton}
      >
        <BsCpu style={{fontSize: "40px"}}/>
        <p>Devices</p>
      </button>
      <button onClick={function (){clearUserSessionToken();}}>Logout</button>
    </nav>
  );
}