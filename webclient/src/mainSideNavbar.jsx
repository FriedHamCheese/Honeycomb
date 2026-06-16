import styles from './mainSideNavbar.module.css'

import {useNavigate} from 'react-router';
import {BsCpu} from 'react-icons/bs';

export function MainSideNavbar({selectedPage, params}){
  const navigate = useNavigate();
  
  return (
    <nav className={styles.sidebar}>
      <button className={styles.sidebarButton} onClick={() => navigate(params.relativeLinkToHome)}>
        <img src="/honeycomb.png" alt="honeycomb icon" className={styles.honeycombIcon}/> 
      </button>
      <button className={selectedPage === "devices" ? styles.sidebarButtonSelected : styles.sidebarButton}>
        <BsCpu style={{fontSize: "40px"}}/>
        <p>Devices</p>
      </button>
      <button className={selectedPage === "xd" ? styles.sidebarButtonSelected : styles.sidebarButton}>
        <BsCpu style={{fontSize: "40px"}}/>
        <p>Devices</p>
      </button>
    </nav>
  );
}