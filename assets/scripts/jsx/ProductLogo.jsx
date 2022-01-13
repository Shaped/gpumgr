class ProductLogo extends React.Component {
	constructor(props) {
		super(props);
	}

	render() {
		let type=null;

		this.props.ProductName.includes("GeForce")?type='GeForce':null;
		this.props.ProductName.includes("GTX")?type='GTX':null;
		this.props.ProductName.includes("Max-Q")?type='Max-Q':null; //*::TODO:: add TI, Super and a million other names?
		this.props.ProductName.includes("RTX")?type='RTX':null;
		this.props.ProductName.includes("Titan")?type='Titan':null;
		this.props.ProductName.includes("Titan RTX")?type='Titan RTX':null;
		this.props.ProductName.includes("Quadro")?type='Quadro':null;
		this.props.ProductName.includes("Quadro RTX")?type='Quadro RTX':null;
		this.props.ProductName.includes("Radeon")?type='Radeon':null;
		this.props.ProductName.includes("FirePro")?type='FirePro':null;
		this.props.ProductName.includes("Vega")?type='Vega':null;
		this.props.ProductName.includes("Iris")?type='Iris':null;
		this.props.ProductName.includes("Arc")?type='Arc':null;

		this.productImage = gpumgr.productTypeImages.find(
			(v) => { if (v.type == type) return true; }
		);

		if (type != null) {
			return (<img className="productTypeImage" src={"/img/vendor/"+this.productImage.image} />);
		} else {
			return null;
		}
	}
}