class CardWrapper extends React.Component {
	constructor(props){
		super(props);
		this.state={children:[]};
		console.log('cw')
		console.log(props)
	}
	addChild(child) {
		child.ref = React.createRef();
		child.props = this.props;
		this.setState({
		  children: [...this.state.children, child],
		});
	}
	render() {
		let possibleChildren = { Card };
		let children=[];
		this.state.children.map((child,i) => {
			if (typeof possibleChildren[child.componentName] === 'undefined')
				throw new Error("Component not whitelisted")
			children.push(React.createElement(possibleChildren[child.componentName], {ref:child.ref, key:i, ...child.props}));
		});
		return (
			<div className="cardWrapper">
				{children}
			</div>
			);
	}
}
